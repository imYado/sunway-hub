import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  allowedWords,
  auditLog,
  blockedWords,
  clubManagerRequests,
  clubs,
  contactMessages,
  events,
  postTitleHistory,
  posts,
  reports,
  storedFiles,
  userAvatars,
  users,
} from "@/db/schema";
import { env } from "@/lib/env";
import { normaliseText } from "@/lib/profanity/filter";
import type { Actor } from "../actor-types";
import { audit } from "../audit";
import { hasRecentAuth, revokeAllSessions } from "../auth/session";
import { AppError, NotFoundError, ReauthRequiredError } from "../errors";
import { invalidateFilterCache } from "../profanity";
import { deleteComment, describeComment } from "./comments";
import { notify, notifyFollowersOfPost } from "./notifications";
import { assertAdmin, assertNotAdminTarget } from "./policy";
import { deleteGroup, describeGroup } from "./groups";
import { setHidden, type ReportTarget } from "./reports";
import { assertUsernameAvailable, eraseUser, softDeleteFile } from "./users";
import { storageStatus } from "./uploads";

/** Sensitive admin actions require the password to have been entered recently. */
export function requireRecentAuth(actor: Actor) {
  assertAdmin(actor);
  if (!hasRecentAuth(actor)) throw new ReauthRequiredError();
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export async function dashboard(actor: Actor) {
  assertAdmin(actor);
  const n = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [pendingPosts, pendingAvatars, pendingLogos, openReports, pendingTeachers, pendingManagers, newUsers, openMessages] = await Promise.all([
    n(db.select({ n: count() }).from(posts).where(and(eq(posts.status, "pending"), isNull(posts.deletedAt)))),
    n(db.select({ n: count() }).from(userAvatars).where(isNotNull(userAvatars.pendingFileId))),
    n(db.select({ n: count() }).from(clubs).where(and(isNotNull(clubs.pendingLogoFileId), isNull(clubs.deletedAt)))),
    n(db.select({ n: count() }).from(reports).where(eq(reports.status, "open"))),
    n(
      db
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.roleLabel, "teacher"), eq(users.teacherVerified, false), eq(users.status, "active"), isNotNull(users.onboardedAt))),
    ),
    n(db.select({ n: count() }).from(clubManagerRequests).where(eq(clubManagerRequests.status, "pending"))),
    n(db.select({ n: count() }).from(users).where(gte(users.createdAt, weekAgo))),
    n(db.select({ n: count() }).from(contactMessages).where(isNull(contactMessages.handledAt))),
  ]);
  const storage = await storageStatus();
  const dbSize = await db.execute<{ size: string }>(sql`select pg_database_size(current_database())::text as size`);
  return {
    pendingPosts,
    pendingAvatars,
    pendingLogos,
    openReports,
    pendingTeachers,
    pendingManagers,
    newUsers,
    openMessages,
    storage,
    databaseBytes: Number(dbSize.rows[0]?.size ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Approval queue
// ---------------------------------------------------------------------------
export async function pendingPosts(actor: Actor) {
  assertAdmin(actor);
  const rows = await db
    .select({
      id: posts.id,
      type: posts.type,
      title: posts.title,
      description: posts.description,
      semester: posts.semester,
      subjectText: posts.subjectText,
      createdAt: posts.createdAt,
      titleEdited: posts.titleEdited,
      links: posts.links,
      anonymous: posts.anonymous,
      authorId: users.id,
      username: users.username,
      displayName: users.displayName,
      teacherVerified: users.teacherVerified,
      clubName: clubs.name,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      location: events.location,
      capacity: events.capacity,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(clubs, eq(clubs.id, posts.clubId))
    .leftJoin(events, eq(events.postId, posts.id))
    .where(and(eq(posts.status, "pending"), isNull(posts.deletedAt)))
    .orderBy(asc(posts.createdAt))
    .limit(100);
  const ids = rows.map((r) => r.id);
  const files = ids.length
    ? await db
        .select({
          id: storedFiles.id,
          postId: storedFiles.postId,
          name: storedFiles.originalName,
          kind: storedFiles.kind,
          size: storedFiles.size,
          sha256: storedFiles.sha256,
          contentType: storedFiles.contentType,
          duplicates: sql<number>`(select count(*)::int from ${storedFiles} o where o.sha256 = ${storedFiles.sha256} and o.id <> ${storedFiles.id} and o.deleted_at is null)`,
        })
        .from(storedFiles)
        .where(and(inArray(storedFiles.postId, ids), isNull(storedFiles.deletedAt)))
        .orderBy(asc(storedFiles.position))
    : [];
  return rows.map((r) => ({ ...r, files: files.filter((f) => f.postId === r.id) }));
}

export const decisionSchema = z.object({
  decision: z.enum(["approve", "reject", "changes"]),
  reason: z.string().trim().max(1000).optional().default(""),
});

export async function decidePost(actor: Actor, postId: string, raw: z.input<typeof decisionSchema>) {
  assertAdmin(actor);
  const { decision, reason } = decisionSchema.parse(raw);
  if (decision !== "approve" && !reason) throw new AppError("Please give a reason or note for the poster.");
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post || post.deletedAt) throw new NotFoundError();
  const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changes_requested";
  await db
    .update(posts)
    .set({ status, decisionReason: reason || null, decidedAt: new Date(), decidedBy: actor.id, updatedAt: new Date() })
    .where(eq(posts.id, postId));
  await audit(actor, `post.${status}`, { type: "post", id: postId }, reason || null, { title: post.title });
  const titles = {
    approved: `Your post "${post.title}" was approved`,
    rejected: `Your post "${post.title}" was not approved`,
    changes_requested: `Changes requested on "${post.title}"`,
  } as const;
  const body =
    status === "approved"
      ? null
      : status === "rejected"
        ? `Reason: ${reason}`
        : `Note from the admin: ${reason}\n\nOnly the title can be edited. To change anything else, delete the post and submit it again.`;
  await notify([post.authorId], { kind: "decision", title: titles[status], body, link: `/posts/${post.id}` });
  if (status === "approved" && post.status !== "approved") {
    await notifyFollowersOfPost({ id: post.id, authorId: post.authorId, title: post.title, clubId: post.type === "club" ? post.clubId : null });
  }
}

export async function bulkDecide(actor: Actor, postIds: string[], decision: "approve" | "reject", reason: string) {
  assertAdmin(actor);
  for (const id of postIds.slice(0, 100)) await decidePost(actor, id, { decision, reason });
}

export async function pendingImages(actor: Actor) {
  assertAdmin(actor);
  const avatars = await db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      fileId: userAvatars.pendingFileId,
    })
    .from(userAvatars)
    .innerJoin(users, eq(users.id, userAvatars.userId))
    .where(isNotNull(userAvatars.pendingFileId));
  const logos = await db
    .select({ clubId: clubs.id, name: clubs.name, slug: clubs.slug, fileId: clubs.pendingLogoFileId })
    .from(clubs)
    .where(and(isNotNull(clubs.pendingLogoFileId), isNull(clubs.deletedAt)));
  return { avatars, logos };
}

export async function decideAvatar(actor: Actor, userId: string, approve: boolean, reason?: string) {
  assertAdmin(actor);
  const [a] = await db.select().from(userAvatars).where(eq(userAvatars.userId, userId)).limit(1);
  if (!a?.pendingFileId) throw new NotFoundError();
  if (!approve && !reason?.trim()) throw new AppError("Please give a reason. It will be sent to the member.");
  const fileId = a.pendingFileId;
  await db
    .update(storedFiles)
    .set({ reviewStatus: approve ? "approved" : "rejected", reviewReason: reason?.trim() || null, reviewedAt: new Date(), reviewedBy: actor.id })
    .where(eq(storedFiles.id, fileId));
  if (approve) {
    if (a.approvedFileId) await softDeleteFile(a.approvedFileId);
    await db.update(userAvatars).set({ approvedFileId: fileId, pendingFileId: null, lastRejectionReason: null }).where(eq(userAvatars.userId, userId));
  } else {
    // The old approved picture (or initials) stays.
    await db.update(userAvatars).set({ pendingFileId: null, lastRejectionReason: reason!.trim() }).where(eq(userAvatars.userId, userId));
    await softDeleteFile(fileId);
  }
  await audit(actor, approve ? "avatar.approve" : "avatar.reject", { type: "user", id: userId }, reason ?? null);
  await notify([userId], {
    kind: "decision",
    title: approve ? "Your new profile picture was approved" : "Your new profile picture was not approved",
    body: approve ? null : `Reason: ${reason}`,
    link: "/settings",
  });
}

export async function decideLogo(actor: Actor, clubId: string, approve: boolean, reason?: string) {
  assertAdmin(actor);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club?.pendingLogoFileId) throw new NotFoundError();
  if (!approve && !reason?.trim()) throw new AppError("Please give a reason.");
  const fileId = club.pendingLogoFileId;
  await db
    .update(storedFiles)
    .set({ reviewStatus: approve ? "approved" : "rejected", reviewReason: reason?.trim() || null, reviewedAt: new Date(), reviewedBy: actor.id })
    .where(eq(storedFiles.id, fileId));
  if (approve) {
    if (club.logoFileId) await softDeleteFile(club.logoFileId);
    await db.update(clubs).set({ logoFileId: fileId, pendingLogoFileId: null }).where(eq(clubs.id, clubId));
  } else {
    await db.update(clubs).set({ pendingLogoFileId: null }).where(eq(clubs.id, clubId));
    await softDeleteFile(fileId);
  }
  const [uploader] = await db.select({ ownerId: storedFiles.ownerId }).from(storedFiles).where(eq(storedFiles.id, fileId)).limit(1);
  await audit(actor, approve ? "club_logo.approve" : "club_logo.reject", { type: "club", id: clubId }, reason ?? null);
  if (uploader?.ownerId) {
    await notify([uploader.ownerId], {
      kind: "decision",
      title: approve ? `The new logo for ${club.name} was approved` : `The new logo for ${club.name} was not approved`,
      body: approve ? null : `Reason: ${reason}`,
      link: `/clubs/${club.slug}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
export async function searchContent(actor: Actor, opts: { q?: string; deleted?: boolean }) {
  assertAdmin(actor);
  const conds: SQL[] = [];
  if (opts.q?.trim()) conds.push(ilike(posts.title, `%${opts.q.trim().replace(/[%_\\]/g, "\\$&")}%`));
  conds.push(opts.deleted ? isNotNull(posts.deletedAt) : isNull(posts.deletedAt));
  return db
    .select({
      id: posts.id,
      title: posts.title,
      type: posts.type,
      status: posts.status,
      createdAt: posts.createdAt,
      deletedAt: posts.deletedAt,
      deleteReason: posts.deleteReason,
      hiddenByReports: posts.hiddenByReports,
      titleEdited: posts.titleEdited,
      username: users.username,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(...conds))
    .orderBy(desc(posts.createdAt))
    .limit(100);
}

export async function restorePost(actor: Actor, postId: string) {
  assertAdmin(actor);
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post?.deletedAt) throw new NotFoundError();
  await db.update(posts).set({ deletedAt: null, deletedBy: null, deleteReason: null }).where(eq(posts.id, postId));
  await audit(actor, "post.restore", { type: "post", id: postId });
}

export async function unhidePost(actor: Actor, postId: string) {
  assertAdmin(actor);
  await setHidden("post", postId, false);
  await audit(actor, "post.unhide", { type: "post", id: postId });
}

export async function revertTitle(actor: Actor, historyId: string) {
  assertAdmin(actor);
  const [h] = await db.select().from(postTitleHistory).where(eq(postTitleHistory.id, historyId)).limit(1);
  if (!h || h.revertedAt) throw new NotFoundError();
  await db.transaction(async (tx) => {
    const [post] = await tx.select().from(posts).where(eq(posts.id, h.postId)).limit(1);
    if (!post) throw new NotFoundError();
    await tx.insert(postTitleHistory).values({ postId: h.postId, oldTitle: post.title, newTitle: h.oldTitle, editedBy: actor.id });
    await tx.update(posts).set({ title: h.oldTitle, updatedAt: new Date() }).where(eq(posts.id, h.postId));
    await tx.update(postTitleHistory).set({ revertedAt: new Date() }).where(eq(postTitleHistory.id, historyId));
  });
  await audit(actor, "post.title_revert", { type: "post", id: h.postId }, null, { from: h.newTitle, to: h.oldTitle });
}

export async function deleteStoredFile(actor: Actor, fileId: string, reason: string) {
  assertAdmin(actor);
  if (!reason.trim()) throw new AppError("Please give a reason.");
  await softDeleteFile(fileId);
  await audit(actor, "file.delete", { type: "file", id: fileId }, reason);
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export async function searchUsers(actor: Actor, q: string) {
  assertAdmin(actor);
  const term = q.trim();
  const conds: SQL[] = [sql`${users.status} <> 'deleted'`];
  if (term) {
    const like = `%${term.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(users.email, like), ilike(users.username, like), ilike(users.displayName, like)) as SQL);
  }
  return db
    .select()
    .from(users)
    .where(and(...conds))
    .orderBy(desc(users.createdAt))
    .limit(100);
}

export async function getUserForAdmin(actor: Actor, userId: string) {
  assertAdmin(actor);
  if (!z.string().uuid().safeParse(userId).success) throw new NotFoundError();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new NotFoundError();
  const userPosts = await db
    .select({ id: posts.id, title: posts.title, status: posts.status, deletedAt: posts.deletedAt, createdAt: posts.createdAt })
    .from(posts)
    .where(eq(posts.authorId, userId))
    .orderBy(desc(posts.createdAt))
    .limit(200);
  const [avatar] = await db.select().from(userAvatars).where(eq(userAvatars.userId, userId)).limit(1);
  const reportsAgainst = await db
    .select()
    .from(reports)
    .where(and(eq(reports.targetType, "user"), eq(reports.targetId, userId)))
    .orderBy(desc(reports.createdAt))
    .limit(50);
  return { user: u, posts: userPosts, avatar: avatar ?? null, reports: reportsAgainst, isAdminAccount: u.email === env.adminEmail };
}

async function loadTarget(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.status === "deleted") throw new NotFoundError();
  assertNotAdminTarget(u.email, env.adminEmail);
  return u;
}

export async function setTeacherVerified(actor: Actor, userId: string, verified: boolean) {
  assertAdmin(actor);
  const u = await loadTarget(userId);
  if (verified && u.roleLabel !== "teacher") throw new AppError("Only members whose role is Teacher can be verified.");
  await db.update(users).set({ teacherVerified: verified }).where(eq(users.id, userId));
  await audit(actor, verified ? "user.teacher_verify" : "user.teacher_unverify", { type: "user", id: userId });
  if (verified) await notify([userId], { kind: "decision", title: "Your teacher badge was verified", link: "/settings" });
}

export async function setRoleLabel(actor: Actor, userId: string, role: "student" | "teacher" | "other") {
  assertAdmin(actor);
  await loadTarget(userId);
  await db
    .update(users)
    .set({ roleLabel: role, ...(role !== "teacher" ? { teacherVerified: false } : {}) })
    .where(eq(users.id, userId));
  await audit(actor, "user.role_label", { type: "user", id: userId }, null, { role });
}

/** Admin-only rename. Unlike members, the admin can give out two-character usernames, and the 30-day limit does not apply. */
export async function setUsername(actor: Actor, userId: string, raw: string) {
  assertAdmin(actor);
  const username = raw.trim().toLowerCase();
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.status === "deleted") throw new NotFoundError();
  if (!u.onboardedAt) throw new AppError("This member has not finished signing up yet.");
  if (username === u.username) return;
  await assertUsernameAvailable(username, userId, { allowShort: true });
  await db.update(users).set({ username }).where(eq(users.id, userId));
  await audit(actor, "user.username", { type: "user", id: userId }, null, { from: u.username, to: username });
  if (userId !== actor.id) {
    await notify([userId], { kind: "decision", title: `The admin changed your username to @${username}`, link: "/settings" });
  }
}

export async function suspendUser(actor: Actor, userId: string, days: number, reason: string) {
  requireRecentAuth(actor);
  await loadTarget(userId);
  if (!reason.trim()) throw new AppError("Please give a reason.");
  const until = new Date(Date.now() + Math.max(1, Math.min(365, Math.floor(days))) * 86_400_000);
  await db.update(users).set({ status: "suspended", suspendedUntil: until }).where(eq(users.id, userId));
  await revokeAllSessions(userId);
  await audit(actor, "user.suspend", { type: "user", id: userId }, reason, { until: until.toISOString() });
}

export async function banUser(actor: Actor, userId: string, reason: string) {
  requireRecentAuth(actor);
  await loadTarget(userId);
  if (!reason.trim()) throw new AppError("Please give a reason.");
  await db.update(users).set({ status: "banned", suspendedUntil: null }).where(eq(users.id, userId));
  await revokeAllSessions(userId);
  await audit(actor, "user.ban", { type: "user", id: userId }, reason);
}

export async function reinstateUser(actor: Actor, userId: string) {
  requireRecentAuth(actor);
  await loadTarget(userId);
  await db.update(users).set({ status: "active", suspendedUntil: null, hiddenByReports: false }).where(eq(users.id, userId));
  await audit(actor, "user.reinstate", { type: "user", id: userId });
}

export async function forceSignOut(actor: Actor, userId: string) {
  requireRecentAuth(actor);
  await loadTarget(userId);
  await revokeAllSessions(userId);
  await audit(actor, "user.force_sign_out", { type: "user", id: userId });
}

export async function adminDeleteUser(actor: Actor, userId: string, mode: "delete_posts" | "anonymise_posts", reason: string) {
  requireRecentAuth(actor);
  await loadTarget(userId);
  if (!reason.trim()) throw new AppError("Please give a reason.");
  await eraseUser(userId, mode, actor, reason);
}

export async function warnUser(actor: Actor, userId: string, message: string) {
  assertAdmin(actor);
  await loadTarget(userId);
  await db
    .update(users)
    .set({ warningCount: sql`${users.warningCount} + 1` })
    .where(eq(users.id, userId));
  await notify([userId], { kind: "system", title: "A warning from the SJ Study admin", body: message, link: "/guidelines" });
  await audit(actor, "user.warn", { type: "user", id: userId }, message);
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export async function openReports(actor: Actor) {
  assertAdmin(actor);
  const rows = await db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      reason: reports.reason,
      note: reports.note,
      createdAt: reports.createdAt,
      reporter: users.username,
    })
    .from(reports)
    .leftJoin(users, eq(users.id, reports.reporterId))
    .where(eq(reports.status, "open"))
    .orderBy(asc(reports.createdAt))
    .limit(200);
  // Group by target for the queue.
  const groups = new Map<string, { targetType: string; targetId: string; label: string; link: string | null; ownerId: string | null; hidden: boolean; items: typeof rows }>();
  for (const r of rows) {
    const key = `${r.targetType}:${r.targetId}`;
    if (!groups.has(key)) groups.set(key, { targetType: r.targetType, targetId: r.targetId, label: "", link: null, ownerId: null, hidden: false, items: [] });
    groups.get(key)!.items.push(r);
  }
  for (const g of groups.values()) {
    if (g.targetType === "post") {
      const [p] = await db.select().from(posts).where(eq(posts.id, g.targetId)).limit(1);
      g.label = p ? `Post: ${p.title}` : "Post (removed)";
      g.link = p ? `/posts/${p.id}` : null;
      g.ownerId = p?.authorId ?? null;
      g.hidden = !!p?.hiddenByReports;
    } else if (g.targetType === "comment") {
      const c = await describeComment(g.targetId);
      g.label = c ? `Comment: ${c.body.slice(0, 80) || "(attachment only)"}` : "Comment (removed)";
      g.link = c ? `/posts/${c.postId}#comment-${c.id}` : null;
      g.ownerId = c?.authorId ?? null;
      g.hidden = !!c?.hidden;
    } else if (g.targetType === "user") {
      const [u] = await db.select().from(users).where(eq(users.id, g.targetId)).limit(1);
      g.label = u ? `Profile: @${u.username}` : "Profile (removed)";
      g.link = u ? `/admin/users/${u.id}` : null;
      g.ownerId = u?.id ?? null;
      g.hidden = !!u?.hiddenByReports;
    } else if (g.targetType === "study_group") {
      const item = await describeGroup(g.targetId, actor.id);
      g.label = item ? item.label : "Study group (removed)";
      g.link = item?.link ?? null;
      g.ownerId = item?.ownerId ?? null;
      g.hidden = !!item?.hidden;
    } else {
      const [c] = await db.select().from(clubs).where(eq(clubs.id, g.targetId)).limit(1);
      g.label = c ? `Club: ${c.name}` : "Club (removed)";
      g.link = c ? `/clubs/${c.slug}` : null;
      g.hidden = !!c?.hiddenByReports;
    }
  }
  return [...groups.values()];
}

export async function resolveReports(
  actor: Actor,
  targetType: ReportTarget,
  targetId: string,
  action: "dismiss" | "remove" | "warn" | "ban",
  note: string,
) {
  assertAdmin(actor);
  if (action !== "dismiss" && !note.trim()) throw new AppError("Please add a note explaining the action.");
  if (action === "remove") {
    if (targetType === "post") {
      const { deletePost } = await import("./posts");
      await deletePost(actor, targetId, note);
    } else if (targetType === "comment") {
      await deleteComment(actor, targetId, note);
    } else if (targetType === "club") {
      const { adminDeleteClub } = await import("./clubs");
      await adminDeleteClub(actor, targetId, note);
    } else if (targetType === "user") {
      await setHidden("user", targetId, true);
    } else {
      await deleteGroup(actor, targetId, note);
    }
  } else if (action === "warn" || action === "ban") {
    let userId = targetId;
    if (targetType === "post") {
      const [p] = await db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, targetId)).limit(1);
      if (!p) throw new NotFoundError();
      userId = p.authorId;
    } else if (targetType === "comment") {
      const c = await describeComment(targetId);
      if (!c) throw new NotFoundError();
      userId = c.authorId;
    } else if (targetType === "club") {
      throw new AppError("Clubs cannot be warned or banned. Remove the club or dismiss the reports.");
    } else if (targetType !== "user") {
      const item = await describeGroup(targetId, actor.id);
      if (!item) throw new NotFoundError();
      userId = item.ownerId;
    }
    if (action === "warn") await warnUser(actor, userId, note);
    else await banUser(actor, userId, note);
  } else {
    // Dismissed: if it was auto-hidden, show it again.
    await setHidden(targetType, targetId, false);
  }
  await db
    .update(reports)
    .set({ status: action === "dismiss" ? "dismissed" : "actioned", resolution: `${action}: ${note}`.slice(0, 1000), resolvedBy: actor.id, resolvedAt: new Date() })
    .where(and(eq(reports.targetType, targetType), eq(reports.targetId, targetId), eq(reports.status, "open")));
  await audit(actor, `reports.${action}`, { type: targetType, id: targetId }, note || null);
}

// ---------------------------------------------------------------------------
// Blocked words
// ---------------------------------------------------------------------------
function cleanWord(raw: string): string {
  const keepStar = raw.trim().endsWith("*");
  const w = normaliseText(raw.trim().replace(/\*$/, "")).replace(/[^\p{L} ]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60);
  return w ? (keepStar ? `${w}*` : w) : "";
}

export async function listWords(actor: Actor) {
  assertAdmin(actor);
  const [b, a] = await Promise.all([
    db.select().from(blockedWords).orderBy(asc(blockedWords.word)),
    db.select().from(allowedWords).orderBy(asc(allowedWords.word)),
  ]);
  return { blocked: b, allowed: a };
}

export async function addWords(actor: Actor, list: "blocked" | "allowed", raw: string) {
  assertAdmin(actor);
  const words = [...new Set(raw.split(/[\n,]+/).map(cleanWord).filter(Boolean))].slice(0, 2000);
  if (words.length === 0) throw new AppError("Enter at least one word.");
  const table = list === "blocked" ? blockedWords : allowedWords;
  for (let i = 0; i < words.length; i += 500) {
    await db
      .insert(table)
      .values(words.slice(i, i + 500).map((word) => ({ word, addedBy: actor.id })))
      .onConflictDoNothing();
  }
  invalidateFilterCache();
  await audit(actor, `words.${list}_add`, {}, null, { count: words.length });
  return words.length;
}

export async function removeWord(actor: Actor, list: "blocked" | "allowed", id: string) {
  assertAdmin(actor);
  const table = list === "blocked" ? blockedWords : allowedWords;
  const [row] = await db.delete(table).where(eq(table.id, id)).returning();
  invalidateFilterCache();
  if (row) await audit(actor, `words.${list}_remove`, {}, null, { word: row.word });
}

// ---------------------------------------------------------------------------
// Audit log and messages
// ---------------------------------------------------------------------------
export async function listAudit(actor: Actor, opts: { page?: number; limit?: number } = {}) {
  assertAdmin(actor);
  const limit = Math.min(opts.limit ?? 100, 10000);
  return db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.at))
    .limit(limit)
    .offset(((opts.page ?? 1) - 1) * limit);
}

export async function listMessages(actor: Actor) {
  assertAdmin(actor);
  return db.select().from(contactMessages).orderBy(desc(contactMessages.createdAt)).limit(200);
}

export async function markMessageHandled(actor: Actor, id: string) {
  assertAdmin(actor);
  await db.update(contactMessages).set({ handledAt: new Date() }).where(eq(contactMessages.id, id));
  await audit(actor, "message.handled", { type: "message", id });
}

