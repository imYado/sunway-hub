"use server";

import { hmacHex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { emailInputSchema } from "@/lib/rules";
import { cookies } from "next/headers";
import { GUEST_COOKIE, getSession } from "@/server/actor";
import { readSessionToken, writeSessionCookie } from "@/server/auth/cookies";
import {
  REJECTED_MESSAGE,
  adminPasswordLogin,
  completeAdminPassword,
  completeTotpStep,
  requestAdminReset,
  startLogin,
  verifyLoginCode,
  type NewSession,
} from "@/server/auth/login";
import type { OtpPurpose } from "@/server/auth/otp";
import { revokeSessionByToken } from "@/server/auth/session";
import { AppError, RateLimitError } from "@/server/errors";
import { clientIp, userAgent } from "@/server/request";

export type LoginResult =
  | { ok: true; step?: "code" | "password" | "create_password" | "totp" | "done"; purpose?: OtpPurpose; email?: string }
  | { ok: false; error: string };

const NEUTRAL_FAILURE = "We could not continue right now. Please wait a moment and try again.";

/** Keep response timing similar for every outcome so it reveals nothing about accounts. */
async function padTiming<T>(fn: () => Promise<T>, minMs = 900): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const wait = minMs - (Date.now() - start);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
}

async function ctx() {
  const ip = await clientIp();
  return { ipKey: ip, ipHash: hmacHex(env.sessionSecret, `ip:${ip}`).slice(0, 32), userAgent: await userAgent() };
}

async function startSession(s: NewSession) {
  // Rotate: drop whatever session this browser had before.
  const old = await readSessionToken();
  if (old) await revokeSessionByToken(old);
  await writeSessionCookie(s.token, s.expiresAt);
}

function errorOf(err: unknown, fallback = NEUTRAL_FAILURE): string {
  if (err instanceof RateLimitError) return err.message;
  if (err instanceof AppError) return err.message;
  console.error("login error:", err instanceof Error ? err.name : "unknown");
  return fallback;
}

export async function startLoginAction(rawEmail: string): Promise<LoginResult> {
  return padTiming(async () => {
    const parsed = emailInputSchema.safeParse(rawEmail);
    if (!parsed.success) return { ok: false, error: REJECTED_MESSAGE };
    try {
      const c = await ctx();
      const r = await startLogin(parsed.data, c.ipKey);
      if (r.step === "rejected") return { ok: false, error: REJECTED_MESSAGE };
      if (r.step === "password") return { ok: true, step: "password", email: r.email };
      return { ok: true, step: "code", purpose: r.purpose, email: r.email };
    } catch (err) {
      return { ok: false, error: errorOf(err) };
    }
  });
}

export async function verifyCodeAction(email: string, purpose: OtpPurpose, code: string): Promise<LoginResult> {
  return padTiming(async () => {
    try {
      const c = await ctx();
      const s = await verifyLoginCode(email, purpose, code.replace(/\s+/g, ""), c.ipKey, { ipHash: c.ipHash, userAgent: c.userAgent });
      await startSession(s);
      return { ok: true, step: s.stage === "needs_password" ? "create_password" : "done" };
    } catch (err) {
      return { ok: false, error: errorOf(err) };
    }
  }, 500);
}

export async function passwordAction(email: string, password: string): Promise<LoginResult> {
  return padTiming(async () => {
    try {
      const c = await ctx();
      const s = await adminPasswordLogin(email, password, c.ipKey, { ipHash: c.ipHash, userAgent: c.userAgent });
      await startSession(s);
      return { ok: true, step: s.stage === "needs_totp" ? "totp" : "done" };
    } catch (err) {
      return { ok: false, error: errorOf(err) };
    }
  }, 500);
}

export async function createPasswordAction(password: string): Promise<LoginResult> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, error: "This step has expired. Please sign in again." };
    const next = await completeAdminPassword(session, password);
    return { ok: true, step: next === "needs_totp" ? "totp" : "done" };
  } catch (err) {
    return { ok: false, error: errorOf(err) };
  }
}

export async function totpAction(code: string): Promise<LoginResult> {
  try {
    const session = await getSession();
    if (!session) return { ok: false, error: "This step has expired. Please sign in again." };
    const c = await ctx();
    await completeTotpStep(session, code.replace(/\s+/g, ""), c.ipKey);
    return { ok: true, step: "done" };
  } catch (err) {
    return { ok: false, error: errorOf(err) };
  }
}

export async function forgotPasswordAction(email: string): Promise<LoginResult> {
  return padTiming(async () => {
    try {
      const c = await ctx();
      await requestAdminReset(email, c.ipKey);
      return { ok: true, step: "code", purpose: "admin_reset", email };
    } catch (err) {
      return { ok: false, error: errorOf(err) };
    }
  });
}

/** Read-only browsing without an account. */
export async function continueAsGuestAction(): Promise<LoginResult> {
  (await cookies()).set(GUEST_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return { ok: true, step: "done" };
}
