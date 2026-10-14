"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actorForAction } from "@/server/actor";
import { runAction, str, type ActionState } from "@/server/action-utils";
import {
  createPost,
  deletePost,
  editPostTitle,
  setRsvp,
  toggleBookmark,
  toggleHelpful,
  type CreatePostInput,
} from "@/server/dal/posts";
import { createReport, type ReportTarget } from "@/server/dal/reports";
import { toggleFollowClub, toggleFollowSubject } from "@/server/dal/clubs";

export async function createPostAction(input: CreatePostInput): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const r = await createPost(actor, input);
    return { ok: true, data: r };
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

export async function helpfulAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "postId");
    await toggleHelpful(actor, id);
    revalidatePath(`/posts/${id}`);
  });
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
