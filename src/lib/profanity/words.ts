/**
 * Built-in blocked words, in addition to the English dataset that ships with
 * the `obscenity` library. The admin can add/remove more words at runtime
 * (stored in Neon) and add allow-list entries for false positives.
 *
 * Syntax:
 *   "word"   matches the whole word, plus common suffixes (s, es, ed, er, ing ...)
 *   "word*"  matches anywhere inside a word (only for unambiguous strings)
 *   "a b"    a phrase; matches with or without the spaces
 *
 * Matching ignores case, accents, repeated letters, leetspeak and inserted
 * dots/spaces/symbols. Whole-word matching avoids the "Scunthorpe problem".
 */

export const ENGLISH_WORDS = [
  "fuck*",
  "motherfuck*",
  "phuck*",
  "shit",
  "bullshit",
  "shithead",
  "bitch",
  "cunt",
  "asshole",
  "arsehole",
  "ass",
  "arse",
  "bastard",
  "dick",
  "dickhead",
  "cock",
  "pussy",
  "slut",
  "whore",
  "wanker",
  "twat",
  "bollocks",
  "nigger*",
  "nigga",
  "faggot",
  "fag",
  "retard",
  "jackass",
  "dumbass",
  "douchebag",
  "porn",
  "porno",
  "dildo",
  "blowjob",
  "handjob",
  "stfu",
  "wtf",
];

// Common Malay profanity and insults.
export const MALAY_WORDS = [
  "babi",
  "sial",
  "celaka",
  "puki",
  "pukimak",
  "pukimek",
  "kimak",
  "pantat",
  "lancau",
  "butoh",
  "butuh",
  "jubur",
  "sundal",
  "pelacur",
  "keparat",
  "bangsat",
  "haramjadah",
  "haram jadah",
  "anak haram",
  "burit",
  "pepek",
  "konek",
  "kote",
  "bodoh",
  "bongok",
  "bangang",
  "sohai",
];

// Common transliterated Arabic insults.
export const ARABIC_WORDS = [
  "sharmouta",
  "sharmuta",
  "sharmoota",
  "charmouta",
  "kuss",
  "kus omak",
  "kos omak",
  "kosomak",
  "kusomak",
  "ayre",
  "ayri",
  "zebi",
  "zibi",
  "manyak",
  "manyok",
  "gahba",
  "qahba",
  "ibn el kalb",
  "ibn al kalb",
  "ya ibn el kalb",
  "khara",
  "telhas teezi",
];

// Common transliterated Chinese dialect (Hokkien, Cantonese, Mandarin) insults used in Malaysia.
export const CHINESE_WORDS = [
  "cibai",
  "chibai",
  "chee bye",
  "chee bai",
  "lanjiao",
  "lan jiao",
  "lanpa",
  "lan pa",
  "kanina",
  "kannina",
  "kan ni na",
  "kanasai",
  "nabei",
  "diu",
  "diu lei",
  "diu nei",
  "diulei",
  "puk gai",
  "pok gai",
  "pukgai",
  "tiu",
  "tamade",
  "ta ma de",
  "caonima",
  "cao ni ma",
  "shabi",
  "sha bi",
  "gan ni niang",
];

// Common transliterated Tamil insults.
export const TAMIL_WORDS = [
  "punda",
  "pundai",
  "pundek",
  "thevidiya",
  "thevdiya",
  "thevudiya",
  "otha",
  "ommala",
  "koothi",
  "oombu",
  "baadu",
];

export const BUILT_IN_BLOCKED = [...ENGLISH_WORDS, ...MALAY_WORDS, ...ARABIC_WORDS, ...CHINESE_WORDS, ...TAMIL_WORDS];

// Words that must never be blocked (common innocent words that resemble entries above).
export const BUILT_IN_ALLOWED = [
  "class",
  "classes",
  "assess",
  "assessment",
  "assignment",
  "assist",
  "assistant",
  "passing",
  "bass",
  "essex",
  "scunthorpe",
  "sussex",
  "cocktail",
  "cockpit",
  "cockroach",
  "peacock",
  "hancock",
  "dickens",
  "shitake",
  "shiitake",
  "analysis",
  "therapist",
  "grape",
  "knn",
  "sunni",
  "cumulative",
  "titanic",
  "hello",
  "babies",
];
