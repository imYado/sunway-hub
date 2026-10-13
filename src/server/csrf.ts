import "server-only";
import type { NextRequest } from "next/server";

/**
 * CSRF protection for route handlers that change state. (Server Actions already
 * compare Origin and Host.) The session cookie is also SameSite=Lax.
 */
export function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
