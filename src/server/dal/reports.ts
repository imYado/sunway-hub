import "server-only";
import { and, countDistinct, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clubs, posts, reports, users } from "@/db/schema";
import { REPORT_NOTE_MAX } from "@/lib/rules";
import { env } from "@/lib/env";
import type { Actor } from "../actor-types";
import { AppError, NotFoundError } from "../errors";
import { assertClean } from "../profanity";
import { enforce, LIMITS } from "../rate-limit";
import { describeComment, setCommentHidden } from "./comments";
import { describeGroup, setGroupHidden } from "./groups";
import { canViewPost } from "./policy";

export const AUTO_HIDE_THRESHOLD = 3;

export const reportSchema = z.object({
  targetType: z.enum(["post", "user", "club", "study_group", "comment"]),
  targetId: z.string().uuid(),
  reason: z.enum(["copyright", "inappropriate", "harassment", "exam_material", "spam", "other"]),
  note: z.string().trim().max(REPORT_NOTE_MAX).optional().default(""),
});

/**
 * Files a report. Content with 3+ open reports from different members is hidden
 * automatically until the admin reviews it. The admin account is never auto-hidden.
 */
export async function createReport(actor: Actor, raw: z.input<typeof reportSchema>): Promise<void> {
  const input = reportSchema.parse(raw);
  await enforce("report", actor.id, LIMITS.reportPerUser.limit, LIMITS.reportPerUser.window);
  await assertClean(input.note);

  if (input.targetType === "post") {
    const [p] = await db.select().from(posts).where(eq(posts.id, input.targetId)).limit(1);
    if (!p || !canViewPost(actor, p)) throw new NotFoundError();
    if (p.authorId === actor.id) throw new AppError("You cannot report your own post.");
  } else if (input.targetType === "comment") {
    const c = await describeComment(input.targetId);
    if (!c || c.deletedAt) throw new NotFoundError();
    const [p] = await db.select().from(posts).where(eq(posts.id, c.postId)).limit(1);
    if (!p || !canViewPost(actor, p)) throw new NotFoundError();
    if (c.authorId === actor.id) throw new AppError("You cannot report your own comment.");
  } else if (input.targetType === "user") {
    const [u] = await db.select().from(users).where(eq(users.id, input.targetId)).limit(1);
    if (!u || u.status === "deleted") throw new NotFoundError();
    if (u.id === actor.id) throw new AppError("You cannot report yourself.");
  } else if (input.targetType === "club") {
    const [c] = await db.select().from(clubs).where(eq(clubs.id, input.targetId)).limit(1);
    if (!c || c.deletedAt) throw new NotFoundError();
  } else {
    // Groups are private, so only their members can report them.
    const item = await describeGroup(input.targetId, actor.id);
    if (!item || item.deleted || (!item.viewerIsMember && !actor.isAdmin)) throw new NotFoundError();
    if (item.ownerId === actor.id) throw new AppError("You cannot report your own group. You can delete it instead.");
  }

  const inserted = await db
    .insert(reports)
    .values({ reporterId: actor.id, targetType: input.targetType, targetId: input.targetId, reason: input.reason, note: input.note || null })
    .onConflictDoNothing()
    .returning({ id: reports.id });
  if (inserted.length === 0) throw new AppError("You have already reported this. The admin will review it.");

  const [r] = await db
    .select({ n: countDistinct(reports.reporterId) })
    .from(reports)
    .where(and(eq(reports.targetType, input.targetType), eq(reports.targetId, input.targetId), eq(reports.status, "open")));
  if (Number(r?.n ?? 0) >= AUTO_HIDE_THRESHOLD) await setHidden(input.targetType, input.targetId, true);
}

export type ReportTarget = z.infer<typeof reportSchema>["targetType"];

export async function setHidden(targetType: ReportTarget, targetId: string, hidden: boolean) {
  if (targetType === "study_group") {
    await setGroupHidden(targetId, hidden);
  } else if (targetType === "post") {
    await db.update(posts).set({ hiddenByReports: hidden }).where(eq(posts.id, targetId));
  } else if (targetType === "comment") {
    await setCommentHidden(targetId, hidden);
  } else if (targetType === "user") {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, targetId)).limit(1);
    if (u && u.email === env.adminEmail) return;
    await db.update(users).set({ hiddenByReports: hidden }).where(eq(users.id, targetId));
  } else {
    await db.update(clubs).set({ hiddenByReports: hidden }).where(eq(clubs.id, targetId));
  }
}
