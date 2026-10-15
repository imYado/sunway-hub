import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { commentVotes, comments, posts, storedFiles, users } from "@/db/schema";
import { MAX_FILES_PER_COMMENT } from "@/lib/files";
import { COMMENT_MAX } from "@/lib/rules";
import type { Actor } from "../actor-types";
import { audit } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { assertClean } from "../profanity";
import { enforce, LIMITS } from "../rate-limit";
import { storage } from "../storage";
import { notify } from "./notifications";
import { assertCanViewPost, canInteract } from "./policy";
import type { VoteValue } from "./posts";
import { finaliseUploads } from "./uploads";

export type CommentRow = typeof comments.$inferSelect;

export interface CommentView {
  id: string;
  parentId: string | null;
  body: string;
  score: number;
  createdAt: Date;
  editedAt: Date | null;
  /** Deleted comments with replies stay as a "[deleted]" placeholder so the thread still reads. */
  deleted: boolean;
  hidden: boolean;
  author: { id: string; username: string | null; displayName: string | null; deleted: boolean; isPoster: boolean; anonymous: boolean; notSunway: boolean };
  files: { id: string; name: string; kind: string; size: number; width: number | null; height: number | null }[];
  viewer: { vote: VoteValue | null; isOwner: boolean; canEdit: boolean; canDelete: boolean; canVote: boolean };
}

async function loadPostFor(actor: Actor, postId: string) {
  if (!z.string().uuid().safeParse(postId).success) throw new NotFoundError();
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  assertCanViewPost(actor, post);
  return post!;
}

async function loadComment(commentId: string): Promise<CommentRow> {
  if (!z.string().uuid().safeParse(commentId).success) throw new NotFoundError();
  const [c] = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
  if (!c) throw new NotFoundError();
  return c;
}

async function refreshCommentCount(postId: string) {
  await db
    .update(posts)
    .set({ commentCount: sql`(select count(*)::int from comments where post_id = ${postId} and deleted_at is null and hidden_by_reports = false)` })
    .where(eq(posts.id, postId));
}

/** Every comment on a post the viewer may see, oldest first. The page builds the tree. */
export async function listComments(actor: Actor, postId: string): Promise<CommentView[]> {
  const post = await loadPostFor(actor, postId);
  const rows = await db
    .select({
      c: comments,
      username: users.username,
      displayName: users.displayName,
      authorStatus: users.status,
      authorSunway: users.sunwayVerified,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.postId, postId))
    .orderBy(asc(comments.createdAt))
    .limit(2000);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.c.id);
  const files = await db
    .select()
    .from(storedFiles)
    .where(and(inArray(storedFiles.commentId, ids), isNull(storedFiles.deletedAt)))
    .orderBy(asc(storedFiles.position));
  const votes = await db
    .select({ commentId: commentVotes.commentId, value: commentVotes.value })
    .from(commentVotes)
    .where(and(inArray(commentVotes.commentId, ids), eq(commentVotes.userId, actor.id)));
  const live = new Set(rows.filter((r) => !r.c.deletedAt).map((r) => r.c.parentId));
  const postOpen = canInteract(actor, post);
  const out: CommentView[] = [];
  for (const { c, username, displayName, authorStatus, authorSunway } of rows) {
    const isOwner = c.authorId === actor.id;
    const deleted = !!c.deletedAt;
    // Deleted comments with no live replies are left out entirely (the admin still sees them).
    if (deleted && !actor.isAdmin && !live.has(c.id)) continue;
    const hiddenFromViewer = c.hiddenByReports && !actor.isAdmin && !isOwner;
    const redacted = (deleted && !actor.isAdmin) || hiddenFromViewer;
    const isPoster = c.authorId === post.authorId;
    // On anonymous posts the poster's comments are anonymous too, or they'd give the poster away.
    const masked = isPoster && post.anonymous && !actor.isAdmin && !isOwner;
    const authorDeleted = authorStatus === "deleted";
    out.push({
      id: c.id,
      parentId: c.parentId,
      body: redacted ? "" : c.body,
      score: c.score,
      createdAt: c.createdAt,
      editedAt: c.editedAt,
      deleted,
      hidden: c.hiddenByReports,
      author:
        redacted || masked
          ? { id: "", username: null, displayName: null, deleted: false, isPoster: masked, anonymous: masked, notSunway: false }
          : {
              id: c.authorId,
              username: authorDeleted ? null : username,
              displayName: authorDeleted ? "Deleted user" : displayName,
              deleted: authorDeleted,
              isPoster,
              anonymous: isPoster && post.anonymous,
              notSunway: !authorDeleted && !(isPoster && post.anonymous) && !authorSunway,
            },
      files: redacted
        ? []
        : files
            .filter((f) => f.commentId === c.id)
            .map((f) => ({ id: f.id, name: f.originalName, kind: f.kind, size: f.size, width: f.width, height: f.height })),
      viewer: {
        vote: (votes.find((v) => v.commentId === c.id)?.value as VoteValue | undefined) ?? null,
        isOwner,
        canEdit: isOwner && !deleted,
        canDelete: !deleted && (isOwner || actor.isAdmin),
        canVote: postOpen && !deleted && !c.hiddenByReports && !isOwner,
      },
    });
  }
  return out;
}

export const commentSchema = z.object({
  postId: z.string().uuid(),
  parentId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  body: z.string().trim().max(COMMENT_MAX, `Comments can be at most ${COMMENT_MAX} characters.`),
  files: z
    .array(z.object({ pathname: z.string().min(1).max(500), name: z.string().min(1).max(200) }))
    .max(MAX_FILES_PER_COMMENT, `You can attach up to ${MAX_FILES_PER_COMMENT} files to a comment.`)
    .default([]),
});

export async function createComment(actor: Actor, raw: z.input<typeof commentSchema>): Promise<{ id: string }> {
  const input = commentSchema.parse(raw);
  if (!input.body && input.files.length === 0) throw new AppError("Write a comment or attach a file.");
  const post = await loadPostFor(actor, input.postId);
  if (!canInteract(actor, post)) throw new AppError("You can comment once this post is approved.");
  await enforce("comment", actor.id, LIMITS.commentPerUser.limit, LIMITS.commentPerUser.window);
  await assertClean(input.body);
  let parent: CommentRow | null = null;
  if (input.parentId) {
    parent = await loadComment(input.parentId);
    if (parent.postId !== post.id) throw new NotFoundError();
    if (parent.deletedAt) throw new AppError("That comment was deleted, so you can't reply to it.");
  }
  const id = crypto.randomUUID();
  const files = await finaliseUploads(actor, post.id, input.files, { comment: true, folder: `files/${post.id}/c/${id}` });
  try {
    await db.transaction(async (tx) => {
      await tx.insert(comments).values({ id, postId: post.id, authorId: actor.id, parentId: parent?.id ?? null, body: input.body });
      if (files.length) {
        await tx
          .insert(storedFiles)
          .values(files.map((f, i) => ({ ownerId: actor.id, purpose: "comment_attachment" as const, commentId: id, position: i, ...f })));
      }
    });
  } catch (err) {
    await storage()
      .delete(files.map((f) => f.storagePath))
      .catch(() => {});
    throw err;
  }
  await refreshCommentCount(post.id);
  const link = `/posts/${post.id}#comment-${id}`;
  if (parent && parent.authorId !== actor.id) {
    await notify([parent.authorId], { kind: "reply", title: `New reply to your comment on "${post.title}"`, link });
  }
  if (post.authorId !== actor.id && post.authorId !== parent?.authorId) {
    await notify([post.authorId], { kind: "reply", title: `New comment on "${post.title}"`, link });
  }
  return { id };
}

/** Only the commenter can edit. The admin can delete or hide, never edit. */
export async function editComment(actor: Actor, commentId: string, rawBody: string): Promise<void> {
  const c = await loadComment(commentId);
  if (c.authorId !== actor.id || c.deletedAt) throw new ForbiddenError("You can only edit your own comments.");
  const body = z.string().trim().min(1, "Comments can't be empty.").max(COMMENT_MAX, `Comments can be at most ${COMMENT_MAX} characters.`).parse(rawBody);
  if (body === c.body) return;
  await enforce("comment", actor.id, LIMITS.commentPerUser.limit, LIMITS.commentPerUser.window);
  await assertClean(body);
  await db.update(comments).set({ body, editedAt: new Date() }).where(eq(comments.id, commentId));
}

/** Soft delete. Replies stay, under a "[deleted]" placeholder. Files go after 30 days. */
export async function deleteComment(actor: Actor, commentId: string, reason?: string): Promise<{ postId: string }> {
  const c = await loadComment(commentId);
  if (c.deletedAt) return { postId: c.postId };
  const own = c.authorId === actor.id;
  if (!own && !actor.isAdmin) throw new ForbiddenError();
  const cleanReason = reason?.trim().slice(0, 500) || null;
  if (!own && !cleanReason) throw new AppError("Please give a reason. It will be sent to the commenter.");
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(comments).set({ deletedAt: now, deletedBy: actor.id, deleteReason: cleanReason }).where(eq(comments.id, commentId));
    await tx.update(storedFiles).set({ deletedAt: now }).where(and(eq(storedFiles.commentId, commentId), isNull(storedFiles.deletedAt)));
  });
  await refreshCommentCount(c.postId);
  if (!own) {
    await audit(actor, "comment.delete_by_admin", { type: "comment", id: commentId }, cleanReason);
    await notify([c.authorId], { kind: "decision", title: "Your comment was removed", body: `Reason: ${cleanReason}`, link: `/posts/${c.postId}` });
  }
  return { postId: c.postId };
}

export async function setCommentHidden(commentId: string, hidden: boolean): Promise<void> {
  const [c] = await db.update(comments).set({ hiddenByReports: hidden }).where(eq(comments.id, commentId)).returning({ postId: comments.postId });
  if (c) await refreshCommentCount(c.postId);
}

export async function voteComment(actor: Actor, commentId: string, value: VoteValue | 0): Promise<number> {
  const c = await loadComment(commentId);
  const post = await loadPostFor(actor, c.postId);
  if (!canInteract(actor, post) || c.deletedAt || c.hiddenByReports) throw new NotFoundError();
  if (c.authorId === actor.id) throw new AppError("You can't vote on your own comment.");
  await enforce("vote", actor.id, LIMITS.votePerUser.limit, LIMITS.votePerUser.window);
  if (value === 0) {
    await db.delete(commentVotes).where(and(eq(commentVotes.commentId, commentId), eq(commentVotes.userId, actor.id)));
  } else {
    await db
      .insert(commentVotes)
      .values({ commentId, userId: actor.id, value })
      .onConflictDoUpdate({ target: [commentVotes.commentId, commentVotes.userId], set: { value } });
  }
  const [row] = await db
    .update(comments)
    .set({ score: sql`(select coalesce(sum(value), 0)::int from comment_votes where comment_id = ${commentId})` })
    .where(eq(comments.id, commentId))
    .returning({ score: comments.score });
  return row?.score ?? 0;
}

/** Used by reports and the file route. */
export async function describeComment(commentId: string) {
  const [c] = await db
    .select({ id: comments.id, postId: comments.postId, authorId: comments.authorId, body: comments.body, hidden: comments.hiddenByReports, deletedAt: comments.deletedAt })
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  return c ?? null;
}
