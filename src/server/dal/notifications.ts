import "server-only";
import { and, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { clubFollows, notificationSettings, notifications, postSubjects, subjectFollows, users } from "@/db/schema";
import type { Actor } from "../actor-types";

/** "reply" (comments and replies) and "message" (private messages) are in-app only, never emailed. */
export type NotificationKind = "decision" | "followed" | "reminder" | "system" | "reply" | "message";

export interface NotifyInput {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey?: string | null;
}

type Settings = typeof notificationSettings.$inferSelect;

function wantsEmail(kind: NotificationKind, s: Settings | undefined): boolean {
  const settings = s ?? { emailDigest: true, emailDecisions: true, emailEventReminders: true };
  if (kind === "decision" || kind === "system") return settings.emailDecisions;
  if (kind === "followed") return settings.emailDigest;
  if (kind === "reminder") return settings.emailEventReminders;
  return false;
}

/**
 * Creates in-app notifications. Emails are never sent here: they are batched
 * into the once-a-day digest by the cron job, to respect Gmail sending limits.
 */
export async function notify(userIds: string[], input: NotifyInput): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const settings = await db.select().from(notificationSettings).where(inArray(notificationSettings.userId, unique));
  const byUser = new Map(settings.map((s) => [s.userId, s]));
  const rows = unique
    .filter((id) => input.kind !== "followed" || (byUser.get(id)?.inAppFollowed ?? true))
    .map((userId) => ({
      userId,
      kind: input.kind,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 1000) ?? null,
      link: input.link ?? null,
      dedupeKey: input.dedupeKey ?? null,
      emailPending: wantsEmail(input.kind, byUser.get(userId)),
    }));
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(notifications)
      .values(rows.slice(i, i + 500))
      .onConflictDoNothing();
  }
}

/** Notifies followers of a newly approved post's subjects or club (not the author). */
export async function notifyFollowersOfPost(post: { id: string; authorId: string; title: string; clubId: string | null }) {
  const subjectFollowers = await db
    .select({ userId: subjectFollows.userId })
    .from(subjectFollows)
    .innerJoin(postSubjects, eq(postSubjects.subjectId, subjectFollows.subjectId))
    .where(eq(postSubjects.postId, post.id));
  const clubFollowers = post.clubId
    ? await db.select({ userId: clubFollows.userId }).from(clubFollows).where(eq(clubFollows.clubId, post.clubId))
    : [];
  const ids = [...subjectFollowers, ...clubFollowers].map((r) => r.userId).filter((id) => id !== post.authorId);
  if (ids.length === 0) return;
  const active = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, [...new Set(ids)]), ne(users.status, "deleted"), ne(users.status, "banned")));
  await notify(
    active.map((u) => u.id),
    { kind: "followed", title: `New: ${post.title}`, link: `/posts/${post.id}`, dedupeKey: `followed:${post.id}` },
  );
}

export async function listNotifications(actor: Actor, limit = 50) {
  return db.select().from(notifications).where(eq(notifications.userId, actor.id)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(actor: Actor): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
  return Number(r?.n ?? 0);
}

export async function markAllRead(actor: Actor) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
}

export async function getNotificationSettings(actor: Actor): Promise<Settings> {
  const [s] = await db.select().from(notificationSettings).where(eq(notificationSettings.userId, actor.id)).limit(1);
  return s ?? { userId: actor.id, emailDigest: true, emailDecisions: true, emailEventReminders: true, inAppFollowed: true };
}

export async function saveNotificationSettings(actor: Actor, s: Omit<Settings, "userId">) {
  await db
    .insert(notificationSettings)
    .values({ userId: actor.id, ...s })
    .onConflictDoUpdate({ target: notificationSettings.userId, set: s });
}
