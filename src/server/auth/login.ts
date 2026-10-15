import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminCredentials, notificationSettings, sessions, users } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { classifyEmail, isAdminEmail, normaliseEmail } from "@/lib/email-domain";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/dates";
import { isAcceptablePassword } from "@/lib/password-strength";
import { AppError } from "../errors";
import { enforce, LIMITS } from "../rate-limit";
import { issueOtp, verifyOtp, type OtpPurpose } from "./otp";
import { dummyVerify, hashPassword, verifyPassword } from "./password";
import { createSessionRecord, setSessionStage, type LoadedSession } from "./session";
import { audit } from "../audit";
import { verifyTotp } from "./totp";

export const REJECTED_MESSAGE = "Only Sunway email addresses can sign in.";
export const BAD_CODE_MESSAGE = "That code is incorrect or has expired. Please request a new one.";
export const BAD_PASSWORD_MESSAGE = "That password is incorrect.";

export type LoginStep =
  | { step: "code"; email: string; purpose: OtpPurpose }
  | { step: "password"; email: string }
  | { step: "rejected" };

function emailOpts() {
  return { adminEmail: env.adminEmail, allowedDomains: env.allowedEmailDomains };
}

/**
 * Step 1 of sign-in. Never reveals whether a member account exists: every
 * allowed-domain address gets the same "code sent" response.
 */
export async function startLogin(rawEmail: string, ipKey: string): Promise<LoginStep> {
  const email = normaliseEmail(rawEmail);
  await enforce("code-ip", ipKey, LIMITS.codeRequestPerIp.limit, LIMITS.codeRequestPerIp.window);
  const kind = classifyEmail(email, emailOpts());
  if (kind === "rejected") return { step: "rejected" };

  if (kind === "admin") {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const creds = user ? await db.select().from(adminCredentials).where(eq(adminCredentials.userId, user.id)).limit(1) : [];
    if (creds.length > 0) return { step: "password", email };
    await enforce("code-email", email, LIMITS.codeRequestPerEmail.limit, LIMITS.codeRequestPerEmail.window);
    await issueOtp(email, "admin_setup");
    return { step: "code", email, purpose: "admin_setup" };
  }

  await enforce("code-email", email, LIMITS.codeRequestPerEmail.limit, LIMITS.codeRequestPerEmail.window);
  const [user] = await db.select({ status: users.status }).from(users).where(eq(users.email, email)).limit(1);
  if (user?.status === "banned") {
    // Same response as everyone else; the code simply never arrives.
    return { step: "code", email, purpose: "login" };
  }
  await issueOtp(email, "login");
  return { step: "code", email, purpose: "login" };
}

export async function requestAdminReset(rawEmail: string, ipKey: string): Promise<void> {
  const email = normaliseEmail(rawEmail);
  await enforce("code-ip", ipKey, LIMITS.codeRequestPerIp.limit, LIMITS.codeRequestPerIp.window);
  if (!isAdminEmail(email, env.adminEmail)) return;
  await enforce("code-email", email, LIMITS.codeRequestPerEmail.limit, LIMITS.codeRequestPerEmail.window);
  await issueOtp(email, "admin_reset");
}

export interface SessionContext {
  ipHash?: string | null;
  userAgent?: string | null;
}

export interface NewSession {
  token: string;
  expiresAt: Date;
  stage: "active" | "needs_password" | "needs_totp";
}

async function ensureUser(email: string, unverified?: { claimedSunwayEmail: string }): Promise<typeof users.$inferSelect> {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    if (unverified && !existing.sunwayVerified && existing.claimedSunwayEmail !== unverified.claimedSunwayEmail) {
      await db.update(users).set({ claimedSunwayEmail: unverified.claimedSunwayEmail }).where(eq(users.id, existing.id));
    }
    return existing;
  }
  const values = unverified ? { email, sunwayVerified: false, claimedSunwayEmail: unverified.claimedSunwayEmail } : { email };
  const [created] = await db.insert(users).values(values).onConflictDoNothing().returning();
  if (created) {
    await db.insert(notificationSettings).values({ userId: created.id }).onConflictDoNothing();
    return created;
  }
  const [again] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return again;
}

/**
 * Creates an active session for a member whose email has already been proven
 * (by an emailed code or by their university Microsoft account).
 */
export async function signInMember(
  email: string,
  ctx: SessionContext,
  refusedMessage: string,
  unverified?: { claimedSunwayEmail: string },
): Promise<NewSession> {
  const user = await ensureUser(email, unverified);
  if (user.status === "banned" || user.status === "deleted") throw new AppError(refusedMessage);
  if (user.status === "suspended") {
    if (user.suspendedUntil && user.suspendedUntil.getTime() <= Date.now()) {
      await db.update(users).set({ status: "active", suspendedUntil: null }).where(eq(users.id, user.id));
    } else {
      const until = user.suspendedUntil ? ` until ${formatDate(user.suspendedUntil)}` : "";
      throw new AppError(`This account is suspended${until}. Contact the site admin if you think this is a mistake.`, 403);
    }
  }
  const s = await createSessionRecord({ userId: user.id, email, stage: "active", ...ctx });
  return { token: s.token, expiresAt: s.expiresAt, stage: "active" };
}

/** Step 2: verify the emailed code and create a session (fully active, or pending the admin password step). */
export async function verifyLoginCode(
  rawEmail: string,
  purpose: OtpPurpose,
  code: string,
  ipKey: string,
  ctx: SessionContext = {},
): Promise<NewSession> {
  const email = normaliseEmail(rawEmail);
  await enforce("verify-ip", ipKey, LIMITS.codeVerifyPerIp.limit, LIMITS.codeVerifyPerIp.window);
  await enforce("verify-email", email, LIMITS.codeVerifyPerEmail.limit, LIMITS.codeVerifyPerEmail.window);
  const kind = classifyEmail(email, emailOpts());
  if (kind === "rejected") throw new AppError(BAD_CODE_MESSAGE);
  if (kind === "member" && purpose !== "login") throw new AppError(BAD_CODE_MESSAGE);
  if (kind === "admin" && purpose !== "admin_setup" && purpose !== "admin_reset") throw new AppError(BAD_CODE_MESSAGE);

  const ok = await verifyOtp(email, purpose, code);
  if (!ok) throw new AppError(BAD_CODE_MESSAGE);

  if (kind === "member") return signInMember(email, ctx, BAD_CODE_MESSAGE);

  // Admin: first-time setup or password reset. Both lead to "create your password".
  const user = await ensureUser(email);
  const [creds] = await db.select().from(adminCredentials).where(eq(adminCredentials.userId, user.id)).limit(1);
  if (purpose === "admin_setup" && creds) throw new AppError(BAD_CODE_MESSAGE);
  if (purpose === "admin_reset" && !creds) throw new AppError(BAD_CODE_MESSAGE);
  const s = await createSessionRecord({ userId: user.id, email, stage: "needs_password", ...ctx });
  return { token: s.token, expiresAt: s.expiresAt, stage: "needs_password" };
}

/** Admin password sign-in. Leads to the TOTP step when two-factor is enabled. */
export async function adminPasswordLogin(rawEmail: string, password: string, ipKey: string, ctx: SessionContext = {}): Promise<NewSession> {
  const email = normaliseEmail(rawEmail);
  await enforce("pw-ip", ipKey, LIMITS.passwordPerIp.limit, LIMITS.passwordPerIp.window);
  if (!isAdminEmail(email, env.adminEmail)) {
    await dummyVerify(password);
    throw new AppError(BAD_PASSWORD_MESSAGE);
  }
  // Per account *and* IP, so a stranger can't lock the admin out; plus a high overall
  // ceiling. The password itself (12+ characters, argon2) makes spread-out guessing hopeless.
  await enforce("pw-account", `admin:${ipKey}`, LIMITS.passwordPerAccount.limit, LIMITS.passwordPerAccount.window);
  await enforce("pw-account-all", "admin", LIMITS.passwordPerAccountTotal.limit, LIMITS.passwordPerAccountTotal.window);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const [creds] = user ? await db.select().from(adminCredentials).where(eq(adminCredentials.userId, user.id)).limit(1) : [];
  if (!user || !creds) {
    await dummyVerify(password);
    throw new AppError(BAD_PASSWORD_MESSAGE);
  }
  if (!(await verifyPassword(creds.passwordHash, password))) {
    await audit(null, "admin.login_failed", { type: "user", id: user.id });
    throw new AppError(BAD_PASSWORD_MESSAGE);
  }
  const stage = creds.totpEnabled ? "needs_totp" : "active";
  const s = await createSessionRecord({ userId: user.id, email, stage, ...ctx });
  return { token: s.token, expiresAt: s.expiresAt, stage };
}

/** Only callable from a session in the "needs_password" stage that belongs to ADMIN_EMAIL. */
export async function completeAdminPassword(session: LoadedSession, password: string): Promise<"active" | "needs_totp"> {
  if (session.stage !== "needs_password") throw new AppError("This step has expired. Please sign in again.");
  if (!isAdminEmail(session.user.email, env.adminEmail)) throw new AppError("Passwords are not available for this account.", 403);
  if (!isAcceptablePassword(password, [session.user.email])) {
    throw new AppError("Choose a stronger password: at least 12 characters, not a common password.");
  }
  const passwordHash = await hashPassword(password);
  const [existing] = await db.select().from(adminCredentials).where(eq(adminCredentials.userId, session.user.id)).limit(1);
  if (existing) {
    await db.update(adminCredentials).set({ passwordHash, updatedAt: new Date() }).where(eq(adminCredentials.userId, session.user.id));
    // A password reset signs out every other session.
    const others = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, session.user.id));
    for (const o of others) if (o.id !== session.id) await db.delete(sessions).where(eq(sessions.id, o.id));
  } else {
    await db.insert(adminCredentials).values({ userId: session.user.id, passwordHash });
  }
  await audit({ id: session.user.id, username: session.user.username, isAdmin: true }, existing ? "admin.password_reset" : "admin.password_created");
  const next = existing?.totpEnabled ? "needs_totp" : "active";
  await setSessionStage(session.id, next);
  return next;
}

export async function completeTotpStep(session: LoadedSession, code: string, ipKey: string): Promise<void> {
  await enforce("totp-ip", ipKey, LIMITS.passwordPerIp.limit, LIMITS.passwordPerIp.window);
  if (session.stage !== "needs_totp" || !isAdminEmail(session.user.email, env.adminEmail)) {
    throw new AppError("This step has expired. Please sign in again.");
  }
  const [creds] = await db.select().from(adminCredentials).where(eq(adminCredentials.userId, session.user.id)).limit(1);
  if (!creds?.totpEnabled || !creds.totpSecretEnc) throw new AppError("Two-factor authentication is not set up.");
  if (!verifyTotp(decryptSecret(env.sessionSecret, creds.totpSecretEnc), code)) {
    throw new AppError("That code is incorrect. Use the current code from your authenticator app.");
  }
  await setSessionStage(session.id, "active");
}

/** Re-enter password before sensitive admin actions. */
export async function confirmAdminPassword(userId: string, email: string, password: string, ipKey: string): Promise<boolean> {
  await enforce("pw-ip", ipKey, LIMITS.passwordPerIp.limit, LIMITS.passwordPerIp.window);
  if (!isAdminEmail(email, env.adminEmail)) return false;
  const [creds] = await db.select().from(adminCredentials).where(eq(adminCredentials.userId, userId)).limit(1);
  if (!creds) return false;
  return verifyPassword(creds.passwordHash, password);
}

export async function enableTotp(userId: string, secret: string, code: string): Promise<boolean> {
  if (!verifyTotp(secret, code)) return false;
  await db
    .update(adminCredentials)
    .set({ totpSecretEnc: encryptSecret(env.sessionSecret, secret), totpEnabled: true, updatedAt: new Date() })
    .where(eq(adminCredentials.userId, userId));
  return true;
}

export async function disableTotp(userId: string) {
  await db.update(adminCredentials).set({ totpSecretEnc: null, totpEnabled: false, updatedAt: new Date() }).where(eq(adminCredentials.userId, userId));
}

export async function changeAdminPassword(userId: string, email: string, current: string, next: string, ipKey: string) {
  if (!(await confirmAdminPassword(userId, email, current, ipKey))) throw new AppError("Your current password is incorrect.");
  if (!isAcceptablePassword(next, [email])) throw new AppError("Choose a stronger password: at least 12 characters, not a common password.");
  await db.update(adminCredentials).set({ passwordHash: await hashPassword(next), updatedAt: new Date() }).where(eq(adminCredentials.userId, userId));
}

export async function getAdminSecurity(userId: string) {
  const [creds] = await db.select({ totpEnabled: adminCredentials.totpEnabled, updatedAt: adminCredentials.updatedAt }).from(adminCredentials).where(eq(adminCredentials.userId, userId)).limit(1);
  return creds ?? null;
}
