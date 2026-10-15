import { NextResponse, type NextRequest } from "next/server";
import { beginMicrosoftLogin, microsoftEnabled, MS_STATE_COOKIE } from "@/server/auth/microsoft";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!microsoftEnabled()) return NextResponse.redirect(new URL("/login", req.url));
  const { url, pending } = beginMicrosoftLogin(req.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(url);
  res.cookies.set(MS_STATE_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax so the cookie comes back on Microsoft's top-level redirect to the callback.
    sameSite: "lax",
    path: "/api/auth/microsoft",
    maxAge: 600,
  });
  return res;
}
