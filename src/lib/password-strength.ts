// Password rules for the single admin account. Shared by the server (authoritative)
// and the browser (strength meter).

export const PASSWORD_MIN = 12;

// A short list of very common passwords and patterns. Any password that contains
// one of these (ignoring case) is rejected.
const COMMON = [
  "password",
  "passw0rd",
  "p@ssword",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "qwerty",
  "qwertyuiop",
  "asdfgh",
  "zxcvbn",
  "abc123",
  "111111",
  "000000",
  "iloveyou",
  "letmein",
  "welcome",
  "admin",
  "administrator",
  "monkey",
  "dragon",
  "football",
  "baseball",
  "sunshine",
  "princess",
  "master",
  "shadow",
  "superman",
  "trustno1",
  "whatever",
  "freedom",
  "starwars",
  "sunway",
  "malaysia",
  "kualalumpur",
  "changeme",
  "secret",
  "default",
  "login",
  "abcdef",
  "aaaaaa",
];

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Fair" | "Strong" | "Very strong";
  problems: string[];
}

export function checkPassword(password: string, context: string[] = []): StrengthResult {
  const problems: string[] = [];
  const lower = password.toLowerCase();
  if (password.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters.`);
  if (COMMON.some((c) => lower.includes(c))) problems.push("Avoid common passwords and words like \"password\" or \"sunway\".");
  for (const c of context) {
    const part = c.toLowerCase().split("@")[0];
    if (part.length >= 4 && lower.includes(part)) problems.push("Do not include your email address.");
  }
  if (/^(.)\1+$/.test(password)) problems.push("Avoid repeating one character.");

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  const unique = new Set(password).size;
  let score = 0;
  if (password.length >= PASSWORD_MIN) score++;
  if (password.length >= 16) score++;
  if (classes >= 3) score++;
  if (unique >= 10 && password.length >= 14) score++;
  if (problems.length > 0) score = Math.min(score, 1);
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;
  return { score: score as StrengthResult["score"], label: labels[score], problems };
}

export function isAcceptablePassword(password: string, context: string[] = []): boolean {
  const r = checkPassword(password, context);
  return r.problems.length === 0 && r.score >= 2 && password.length <= 256;
}
