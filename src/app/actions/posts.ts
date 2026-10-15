"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actorForAction } from "@/server/actor";
import { runAction, str, type ActionState } from "@/server/action-utils";
import {
  createPost,
  deletePost,
  editPost,
  editPostTitle,
  setPostHidden,
  setRsvp,
  toggleBookmark,
  votePost,
  type CreatePostInput,
  type EditPostInput,
} from "@/server/dal/posts";
import { createComment, deleteComment, editComment, voteComment, type commentSchema } from "@/server/dal/comments";
import type { z } from "zod";
import { createReport, type ReportTarget } from "@/server/dal/reports";
import { toggleFollowClub, toggleFollowSubject } from "@/server/dal/clubs";

export async function createPostAction(input: CreatePostInput): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const r = await createPost(actor, input);
    return { ok: true, data: r };
  });
}

export async function editPostAction(postId: string, input: EditPostInput): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const r = await editPost(actor, postId, input);
    revalidatePath(`/posts/${postId}`);
    return { ok: true, data: { id: postId, status: r.status } };
  });
}

export async function hidePostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "postId");
    const hidden = str(fd, "hidden") === "1";
    await setPostHidden(actor, id, hidden);
    revalidatePath(`/posts/${id}`);
    return hidden ? "Post hidden. Members no longer see it." : "Post visible again.";
  });
}

function voteValue(fd: FormData): 1 | -1 | 0 {
  const v = str(fd, "value");
  return v === "1" ? 1 : v === "-1" ? -1 : 0;
}

export async function votePostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "postId");
    await votePost(actor, id, voteValue(fd));
    revalidatePath(str(fd, "path").startsWith("/") ? str(fd, "path") : `/posts/${id}`);
  });
}

export async function createCommentAction(input: z.input<typeof commentSchema>): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const r = await createComment(actor, input);
    revalidatePath(`/posts/${input.postId}`);
    return { ok: true, data: r };
  });
}

export async function editCommentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await editComment(actor, str(fd, "commentId"), str(fd, "body"));
    revalidatePath(`/posts/${str(fd, "postId")}`);
  });
}

export async function deleteCommentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const r = await deleteComment(actor, str(fd, "commentId"), str(fd, "reason") || undefined);
    revalidatePath(`/posts/${r.postId}`);
  });
}

export async function voteCommentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await voteComment(actor, str(fd, "commentId"), voteValue(fd));
    revalidatePath(`/posts/${str(fd, "postId")}`);
  });
}

export async function editTitleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "postId");
    await editPostTitle(actor, id, str(fd, "title"));
    revalidatePath(`/posts/${id}`);
    return "Title updated.";
  });
}

export async function deletePostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const id = str(fd, "postId");
  const result = await runAction(async () => {
    const actor = await actorForAction();
    await deletePost(actor, id, str(fd, "reason") || undefined);
  });
  if (result?.ok) redirect(str(fd, "redirectTo").startsWith("/") ? str(fd, "redirectTo") : "/");
  return result;
}

export async function bookmarkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "postId");
    await toggleBookmark(actor, id);
    revalidatePath(`/posts/${id}`);
  });
}

export async function rsvpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "postId");
    const status = str(fd, "status");
    await setRsvp(actor, id, status === "going" || status === "interested" ? status : "none");
    revalidatePath(`/posts/${id}`);
  });
}

export async function reportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await createReport(actor, {
      targetType: str(fd, "targetType") as ReportTarget,
      targetId: str(fd, "targetId"),
      reason: str(fd, "reason") as "spam",
      note: str(fd, "note"),
    });
    return "Thanks. The admin will review your report.";
  });
}

export async function followClubAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await toggleFollowClub(actor, str(fd, "clubId"));
    revalidatePath(str(fd, "path") || "/clubs");
  });
}

export async function followSubjectAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await toggleFollowSubject(actor, str(fd, "subjectId"));
    revalidatePath(str(fd, "path") || "/subjects");
  });
}
