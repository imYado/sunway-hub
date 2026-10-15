import { NextResponse, type NextRequest } from "next/server";
import { hmacHex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { readSessionToken, writeSessionCookie } from "@/server/auth/cookies";
import { completeMicrosoftLogin, MS_STATE_COOKIE, type PendingMicrosoftLogin } from "@/server/auth/microsoft";
import { revokeSessionByToken } from "@/server/auth/session";
import { AppError, RateLimitError } from "@/server/errors";
import { clientIp, userAgent } from "@/server/request";

export const dynamic = "force-dynamic";

function readPending(raw: string | undefined): PendingMicrosoftLogin | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (typeof p?.state === "string" && typeof p.nonce === "string" && typeof p.verifier === "string" && typeof p.next === "string") return p;
  } catch {
    // fall through
  }
  return null;
}

function backToLogin(req: NextRequest, error: string) {
  const url = new URL("/login", env.appUrl);
  url.searchParams.set("error", error);
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.delete({ name: MS_STATE_COOKIE, path: "/api/auth/microsoft" });
  return res;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const pending = readPending(req.cookies.get(MS_STATE_COOKIE)?.value);
  if (q.get("error")) {
    // AADSTS65001 / 90094: the university requires an IT admin to approve this app first.
    const desc = q.get("error_description") ?? "";
    const needsApproval = /AADSTS(65001|90094|90095)|admin/i.test(desc);
    return backToLogin(req, needsApproval ? "ms_approval" : q.get("error") === "access_denied" ? "ms_cancelled" : "ms_failed");
  }
  if (!pending) return backToLogin(req, "ms_expired");

  try {
    const ip = await clientIp();
    const s = await completeMicrosoftLogin(pending, { code: q.get("code"), state: q.get("state") }, ip, {
      ipHash: hmacHex(env.sessionSecret, `ip:${ip}`).slice(0, 32),
      userAgent: await userAgent(),
    });
    const old = await readSessionToken();
    if (old) await revokeSessionByToken(old);
    await writeSessionCookie(s.token, s.expiresAt);
    const res = NextResponse.redirect(new URL(pending.next, env.appUrl), { status: 303 });
    res.cookies.delete({ name: MS_STATE_COOKIE, path: "/api/auth/microsoft" });
    return res;
  } catch (err) {
    if (err instanceof RateLimitError) return backToLogin(req, "ms_busy");
    if (err instanceof AppError && err.status === 403 && /suspended/.test(err.message)) return backToLogin(req, "ms_suspended");
    if (err instanceof AppError && err.status === 403) return backToLogin(req, "ms_refused");
    if (!(err instanceof AppError)) console.error("microsoft callback error:", err instanceof Error ? err.name : "unknown");
    return backToLogin(req, "ms_failed");
  }
}
