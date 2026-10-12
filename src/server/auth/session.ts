import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { clubManagers, sessions, users } from "@/db/schema";
import { hmacHex, randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { isAdminEmail } from "@/lib/email-domain";
import type { Actor } from "../actor-types";

export const MEMBER_SESSION_DAYS = 30;
export const ADMIN_IDLE_HOURS = 12;
export const PENDING_STAGE_MINUTES = 15;
export const REAUTH_WINDOW_MINUTES = 15;

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-sh_session" : "sh_session";

export type SessionStage = "active" | "needs_password" | "needs_totp";

export function hashSessionToken(token: string): string {
  return hmacHex(env.sessionSecret, `session:${token}`);
}

export async function createSessionRecord(opts: {
  userId: string;
  email: string;
  stage?: SessionStage;
  ipHash?: string | null;
  userAgent?: string | null;
}): Promise<{ token: string; expiresAt: Date; id: string }> {
  const token = randomToken(32);
  const stage = opts.stage ?? "active";
  const admin = isAdminEmail(opts.email, env.adminEmail);
  const now = Date.now();
  const expiresAt =
    stage !== "active"
      ? new Date(now + PENDING_STAGE_MINUTES * 60_000)
      : admin
        ? new Date(now + MEMBER_SESSION_DAYS * 86_400_000) // bounded further by the 12 h idle timeout
        : new Date(now + MEMBER_SESSION_DAYS * 86_400_000);
  const [row] = await db
    .insert(sessions)
    .values({
      tokenHash: hashSessionToken(token),
      userId: opts.userId,
      stage,
      expiresAt,
      // A fresh password login counts as recent authentication for sensitive admin actions.
      reauthAt: admin && stage === "active" ? new Date() : null,
      ipHash: opts.ipHash ?? null,
      userAgent: opts.userAgent ?? null,
    })
    .returning({ id: sessions.id });
  return { token, expiresAt, id: row.id };
}

export interface LoadedSession {
  id: string;
  stage: SessionStage;
  reauthAt: Date | null;
  expiresAt: Date;
  user: typeof users.$inferSelect;
}

/** Validates a session token. Returns null for unknown, expired, idle or blocked sessions. */
export async function loadSession(token: string | undefined | null): Promise<LoadedSession | null> {
  if (!token || token.length > 200) return null;
  const rows = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashSessionToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const { s, u } = row;
  const now = Date.now();
  if (s.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, s.id));
    return null;
  }
  const admin = isAdminEmail(u.email, env.adminEmail);
  if (admin && s.stage === "active" && now - s.lastUsedAt.getTime() > ADMIN_IDLE_HOURS * 3_600_000) {
    await db.delete(sessions).where(eq(sessions.id, s.id));
    return null;
  }
  if (!admin) {
    if (u.status === "banned" || u.status === "deleted") return null;
    if (u.status === "suspended" && (!u.suspendedUntil || u.suspendedUntil.getTime() > now)) return null;
  }
  // Touch at most every 5 minutes to keep writes low.
  if (now - s.lastUsedAt.getTime() > 5 * 60_000) {
    await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, s.id));
    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, u.id));
  }
  return { id: s.id, stage: s.stage, reauthAt: s.reauthAt, expiresAt: s.expiresAt, user: u };
}

export async function actorFromSession(s: LoadedSession): Promise<Actor> {
  const managed = await db.select({ clubId: clubManagers.clubId }).from(clubManagers).where(eq(clubManagers.userId, s.user.id));
  return {
    id: s.user.id,
    email: s.user.email,
    username: s.user.username,
    displayName: s.user.displayName,
    isAdmin: isAdminEmail(s.user.email, env.adminEmail),
    onboarded: !!s.user.onboardedAt,
    sessionId: s.id,
    reauthAt: s.reauthAt,
    managedClubIds: managed.map((m) => m.clubId),
  };
}

export async function setSessionStage(sessionId: string, stage: SessionStage) {
  const expiresAt = new Date(Date.now() + (stage === "active" ? MEMBER_SESSION_DAYS * 86_400_000 : PENDING_STAGE_MINUTES * 60_000));
  await db
    .update(sessions)
    .set({ stage, expiresAt, lastUsedAt: new Date(), reauthAt: stage === "active" ? new Date() : null })
    .where(eq(sessions.id, sessionId));
}

export async function markReauthenticated(sessionId: string) {
  await db.update(sessions).set({ reauthAt: new Date() }).where(eq(sessions.id, sessionId));
}

export function hasRecentAuth(actor: Pick<Actor, "reauthAt">): boolean {
  return !!actor.reauthAt && Date.now() - actor.reauthAt.getTime() < REAUTH_WINDOW_MINUTES * 60_000;
}

export async function revokeSessionById(id: string) {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function revokeSessionByToken(token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSessionToken(token)));
}

export async function revokeAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function revokeOtherSessions(userId: string, keepId: string) {
  const all = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  const ids = all.map((s) => s.id).filter((id) => id !== keepId);
  if (ids.length) await db.delete(sessions).where(and(eq(sessions.userId, userId), inArray(sessions.id, ids)));
}
