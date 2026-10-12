import "server-only";
import { db } from "@/db";
import { allowedWords, blockedWords } from "@/db/schema";
import { createProfanityFilter, type ProfanityFilter } from "@/lib/profanity/filter";
import { ProfanityError } from "./errors";

// The admin's word lists live in Neon and are cached briefly in memory.
let cache: { at: number; filter: ProfanityFilter } | null = null;
const TTL_MS = 30_000;

export async function getServerFilter(): Promise<ProfanityFilter> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.filter;
  const [blocked, allowed] = await Promise.all([
    db.select({ word: blockedWords.word }).from(blockedWords),
    db.select({ word: allowedWords.word }).from(allowedWords),
  ]);
  const filter = createProfanityFilter({ blocked: blocked.map((b) => b.word), allowed: allowed.map((a) => a.word) });
  cache = { at: Date.now(), filter };
  return filter;
}

export function invalidateFilterCache() {
  cache = null;
}

/** Throws ProfanityError if any of the given texts contains blocked language. */
export async function assertClean(...texts: (string | null | undefined)[]): Promise<void> {
  const filter = await getServerFilter();
  for (const t of texts) {
    if (t && filter.check(t)) throw new ProfanityError();
  }
}
