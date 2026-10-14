import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { clubs, eventRsvps, events, notifications, otpCodes, posts, rateLimits, sessions, storedFiles, users } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { sendEmail } from "./email";
import { notify } from "./dal/notifications";
import { PURGE_AFTER_DAYS } from "./dal/posts";
import { QUARANTINE_PREFIX } from "./dal/uploads";
import { storage } from "./storage";

/**
 * The single daily job (Vercel Hobby allows one run per day). Every step is
 * idempotent, so running it twice in a day is harmless.
 */
export async function runDailyJobs(now = new Date()) {
  const results: Record<string, unknown> = {};
  results.purge = await purgeDeleted(now);
  results.quarantine = await cleanQuarantine(now);
  results.housekeeping = await housekeeping(now);
  results.reminders = await eventReminders(now);
  results.digest = await sendDigests();
  return results;
}

export async function purgeDeleted(now: Date) {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 86_400_000);
  const store = storage();
  const oldPosts = await db.select({ id: posts.id }).from(posts).where(and(isNotNull(posts.deletedAt), lt(posts.deletedAt, cutoff)));
  let purgedPosts = 0;
  for (const p of oldPosts) {
    const files = await db.select({ path: storedFiles.storagePath }).from(storedFiles).where(eq(storedFiles.postId, p.id));
    await store.delete(files.map((f) => f.path));
    await db.delete(posts).where(eq(posts.id, p.id)); // cascades to files, events, votes, bookmarks ...
    purgedPosts++;
  }
  const oldFiles = await db
    .select({ id: storedFiles.id, path: storedFiles.storagePath })
    .from(storedFiles)
    .where(and(isNotNull(storedFiles.deletedAt), lt(storedFiles.deletedAt, cutoff)));
  await store.delete(oldFiles.map((f) => f.path));
  if (oldFiles.length) await db.delete(storedFiles).where(inArray(storedFiles.id, oldFiles.map((f) => f.id)));

  const oldClubs = await db.select({ id: clubs.id }).from(clubs).where(and(isNotNull(clubs.deletedAt), lt(clubs.deletedAt, cutoff)));
  for (const c of oldClubs) {
    const files = await db.select({ id: storedFiles.id, path: storedFiles.storagePath }).from(storedFiles).where(eq(storedFiles.clubId, c.id));
    await store.delete(files.map((f) => f.path));
    if (files.length) await db.delete(storedFiles).where(inArray(storedFiles.id, files.map((f) => f.id)));
    await db.delete(clubs).where(eq(clubs.id, c.id));
  }
  // Deleted accounts with no remaining posts are removed entirely.
  const removedUsers = await db
    .delete(users)
    .where(and(eq(users.status, "deleted"), sql`not exists (select 1 from posts p where p.author_id = ${users.id})`))
    .returning({ id: users.id });
  return { posts: purgedPosts, files: oldFiles.length, clubs: oldClubs.length, users: removedUsers.length };
}

export async function cleanQuarantine(now: Date) {
  const store = storage();
  const objects = await store.list(QUARANTINE_PREFIX);
  const stale = objects.filter((o) => now.getTime() - o.uploadedAt.getTime() > 24 * 3_600_000).map((o) => o.pathname);
  await store.delete(stale);
  return { deleted: stale.length };
}

export async function housekeeping(now: Date) {
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
  const s = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  const o = await db.delete(otpCodes).where(lt(otpCodes.createdAt, dayAgo)).returning({ id: otpCodes.id });
  const r = await db.delete(rateLimits).where(lt(rateLimits.windowStart, dayAgo)).returning({ key: rateLimits.key });
  const n = await db
    .delete(notifications)
    .where(and(isNotNull(notifications.readAt), lt(notifications.createdAt, ninetyDaysAgo)))
    .returning({ id: notifications.id });
  const lifted = await db
    .update(users)
    .set({ status: "active", suspendedUntil: null })
    .where(and(eq(users.status, "suspended"), lt(users.suspendedUntil, now)))
    .returning({ id: users.id });
  return { sessions: s.length, codes: o.length, rateLimits: r.length, notifications: n.length, suspensionsLifted: lifted.length };
}

/** Reminder for events starting 24-36 hours from now that the member RSVPed to. */
export async function eventReminders(now: Date) {
  const from = new Date(now.getTime() + 24 * 3_600_000);
  const to = new Date(now.getTime() + 36 * 3_600_000);
  const rows = await db
    .select({ postId: posts.id, title: posts.title, startsAt: events.startsAt, location: events.location, userId: eventRsvps.userId })
    .from(events)
    .innerJoin(posts, eq(posts.id, events.postId))
    .innerJoin(eventRsvps, eq(eventRsvps.postId, posts.id))
    .where(
      and(
        eq(posts.status, "approved"),
        isNull(posts.deletedAt),
        sql`${events.startsAt} >= ${from}`,
        sql`${events.startsAt} < ${to}`,
      ),
    );
  for (const r of rows) {
    await notify([r.userId], {
      kind: "reminder",
      title: `Reminder: ${r.title} is coming up`,
      body: `${formatDateTime(r.startsAt)} at ${r.location}`,
      link: `/posts/${r.postId}`,
      dedupeKey: `reminder:${r.postId}`,
    });
  }
  return { reminders: rows.length };
}

/** One email per member per day with everything waiting for them (Gmail allows ~500/day). */
export async function sendDigests(maxEmails = 400) {
  const pending = await db
    .select({ id: notifications.id, userId: notifications.userId, title: notifications.title, body: notifications.body, link: notifications.link })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(and(eq(notifications.emailPending, true), isNull(notifications.emailedAt), eq(users.status, "active")))
    .orderBy(asc(notifications.createdAt))
    .limit(5000);
  const byUser = new Map<string, typeof pending>();
  for (const p of pending) {
    if (!byUser.has(p.userId)) byUser.set(p.userId, []);
    byUser.get(p.userId)!.push(p);
  }
  let sent = 0;
  for (const [userId, items] of byUser) {
    if (sent >= maxEmails) break;
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u) continue;
    const lines = items.map((i) => `- ${i.title}${i.body ? `\n  ${i.body.replace(/\n+/g, " ")}` : ""}${i.link ? `\n  ${env.appUrl}${i.link}` : ""}`);
    const ok = await sendEmail({
      to: u.email,
      subject: `SJ Study: ${items.length} update${items.length === 1 ? "" : "s"} for you`,
      text: `Here is your daily SJ Study summary.\n\n${lines.join("\n\n")}\n\nChange which emails you get in Settings: ${env.appUrl}/settings`,
    });
    if (ok) {
      await db
        .update(notifications)
        .set({ emailPending: false, emailedAt: new Date() })
        .where(inArray(notifications.id, items.map((i) => i.id)));
      sent++;
    }
  }
  return { emails: sent, users: byUser.size };
}
