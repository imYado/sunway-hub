/**
 * Where to send someone after sign-in. Only a path on this site is allowed:
 * anything that a browser could read as another origin ("//evil.com",
 * "/\evil.com", "/<tab>/evil.com", ...) falls back to "/".
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || next.length > 2000 || !next.startsWith("/")) return "/";
  // Backslashes and control characters are where browsers and URL parsers disagree.
   
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return "/";
  try {
    const base = "https://sjstudy.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return "/";
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return "/";
  }
}
