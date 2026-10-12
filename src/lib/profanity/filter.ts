import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from "obscenity";
import { BUILT_IN_ALLOWED, BUILT_IN_BLOCKED } from "./words";

/**
 * Bad-word filter that runs both on the server (authoritative, with the
 * admin's extra words from the database) and in the browser (instant feedback,
 * built-in words only).
 */

export const PROFANITY_MESSAGE = "Please remove inappropriate language and try again.";

const LEET: Record<string, string> = {
  "@": "a",
  "4": "a",
  "^": "a",
  "8": "b",
  "(": "c",
  "3": "e",
  "€": "e",
  "6": "g",
  "9": "g",
  "#": "h",
  "1": "i",
  "!": "i",
  "|": "i",
  "0": "o",
  "$": "s",
  "5": "s",
  "§": "s",
  "7": "t",
  "+": "t",
  "2": "z",
};

/** Unicode normalisation, lowercase, strip accents, map leetspeak. Keeps separators. */
export function normaliseText(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
  let out = "";
  for (const ch of base) out += LEET[ch] ?? ch;
  return out;
}

/** Normalises a single word (for allow-list comparisons). */
export function normaliseWord(input: string): string {
  return normaliseText(input).replace(/[^\p{L}]/gu, "");
}

const SEPARATOR_SOFT = /[\s,;:?()[\]{}"'/\\<>=~`]+/u;
const NON_LETTER = /[^\p{L}]+/u;

function joinSingleLetterRuns(tokens: string[]): string[] {
  const out: string[] = [];
  let run = "";
  for (const t of tokens) {
    if (t.length === 1) {
      run += t;
      continue;
    }
    if (run.length > 1) out.push(run);
    else if (run.length === 1) out.push(run);
    run = "";
    out.push(t);
  }
  if (run) out.push(run);
  return out;
}

/** Produces the token sequences we check: words as typed (symbols stripped) and words split on every symbol. */
export function tokenise(input: string): string[][] {
  const norm = normaliseText(input);
  const soft = norm
    .split(SEPARATOR_SOFT)
    .map((t) => t.replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  const hard = norm.split(NON_LETTER).filter(Boolean);
  return [joinSingleLetterRuns(soft), joinSingleLetterRuns(hard), soft, hard];
}

const SUFFIXES = "(?:s|es|ed|er|ers|ing|in|y|ies|z)?";

function runLengthPattern(word: string): string {
  // "ass" -> "a+s{2,}" so "aaasss" matches but "as" does not.
  let out = "";
  let i = 0;
  while (i < word.length) {
    const ch = word[i];
    let n = 1;
    while (word[i + n] === ch) n++;
    const esc = ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out += n === 1 ? `${esc}+` : `${esc}{${n},}`;
    i += n;
  }
  return out;
}

interface CompiledEntry {
  wholeWord?: RegExp;
  substring?: RegExp;
  phrase?: RegExp;
}

function compileEntry(raw: string): CompiledEntry | null {
  const entry = raw.trim();
  if (!entry) return null;
  if (entry.endsWith("*")) {
    const w = normaliseWord(entry.slice(0, -1));
    if (w.length < 3) return null;
    return { substring: new RegExp(runLengthPattern(w), "u") };
  }
  const words = normaliseText(entry)
    .split(NON_LETTER)
    .filter(Boolean);
  if (words.length === 0) return null;
  if (words.length === 1) {
    return { wholeWord: new RegExp(`^${runLengthPattern(words[0])}${SUFFIXES}$`, "u") };
  }
  // Phrase: match the token sequence (with single spaces) or the compacted form as one token.
  const spaced = words.map(runLengthPattern).join(" ");
  const compact = words.map(runLengthPattern).join("");
  return {
    phrase: new RegExp(`(?:^| )${spaced}${SUFFIXES}(?: |$)`, "u"),
    wholeWord: new RegExp(`^${compact}${SUFFIXES}$`, "u"),
  };
}

const obscenityMatcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

export interface ProfanityFilter {
  check(text: string): boolean;
}

export interface FilterOptions {
  blocked?: string[];
  allowed?: string[];
  /** Use the obscenity English dataset as well (default true). */
  useLibrary?: boolean;
}

export function createProfanityFilter(opts: FilterOptions = {}): ProfanityFilter {
  const blockedEntries = [...BUILT_IN_BLOCKED, ...(opts.blocked ?? [])]
    .map(compileEntry)
    .filter((e): e is CompiledEntry => e !== null);
  const allowed = new Set([...BUILT_IN_ALLOWED, ...(opts.allowed ?? [])].map(normaliseWord).filter(Boolean));
  const useLibrary = opts.useLibrary ?? true;

  function tokenHit(token: string): boolean {
    if (allowed.has(token)) return false;
    for (const e of blockedEntries) {
      if (e.wholeWord?.test(token)) return true;
      if (e.substring?.test(token)) return true;
    }
    return false;
  }

  function phraseHit(tokens: string[]): boolean {
    const joined = tokens.filter((t) => !allowed.has(t)).join(" ");
    return blockedEntries.some((e) => e.phrase?.test(joined));
  }

  function libraryHit(text: string): boolean {
    if (!useLibrary) return false;
    const matches = obscenityMatcher.getAllMatches(text);
    for (const m of matches) {
      // Find the whole word around the match in the original text and honour the allow-list.
      let start = m.startIndex;
      let end = m.endIndex + 1;
      while (start > 0 && !/\s/.test(text[start - 1])) start--;
      while (end < text.length && !/\s/.test(text[end])) end++;
      const word = normaliseWord(text.slice(start, end));
      if (word && allowed.has(word)) continue;
      // Also allow when the word, split on symbols, consists only of allowed pieces.
      const pieces = normaliseText(text.slice(start, end)).split(NON_LETTER).filter(Boolean);
      if (pieces.length > 0 && pieces.every((p) => allowed.has(p))) continue;
      return true;
    }
    return false;
  }

  return {
    check(text: string): boolean {
      if (!text) return false;
      for (const tokens of tokenise(text)) {
        if (tokens.some(tokenHit)) return true;
        if (phraseHit(tokens)) return true;
      }
      return libraryHit(text);
    },
  };
}

let defaultFilter: ProfanityFilter | null = null;

/** Built-in words only. Used in the browser and as a fallback. */
export function containsProfanity(text: string): boolean {
  defaultFilter ??= createProfanityFilter();
  return defaultFilter.check(text);
}
