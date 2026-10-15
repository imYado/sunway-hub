import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, clearSessionCookie } from "@/server/auth/cookies";
import { revokeSessionByToken } from "@/server/auth/session";
import { isSameOrigin } from "@/server/csrf";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Bad request" }, { status: 403 });
  const token = await readSessionToken();
  if (token) await revokeSessionByToken(token);
  await clearSessionCookie();
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  res.cookies.delete("sh_guest");
  return res;
}
