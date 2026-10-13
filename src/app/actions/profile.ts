"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actorForAction } from "@/server/actor";
import { bool, runAction, str, type ActionState } from "@/server/action-utils";
import { readSessionToken, clearSessionCookie } from "@/server/auth/cookies";
import { revokeAllSessions, revokeOtherSessions } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { saveNotificationSettings } from "@/server/dal/notifications";
import {
  completeOnboarding,
  deleteMyAccount,
  reacceptLegal,
  removeAvatar,
  requestAccountDeletionCode,
  setEmailVisibility,
  updateProfile,
  uploadAvatar,
} from "@/server/dal/users";
import { AVATAR_MAX_BYTES } from "@/lib/files";

function profileFields(fd: FormData) {
  return {
    displayName: str(fd, "displayName"),
    username: str(fd, "username"),
    roleLabel: str(fd, "roleLabel") as "student" | "teacher" | "other",
    pronouns: str(fd, "pronouns") as "he" | "she" | "unspecified",
    bio: str(fd, "bio"),
  };
}

export async function onboardingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const actor = await actorForAction({ allowNotOnboarded: true });
    if (actor.onboarded) await reacceptLegal(actor, bool(fd, "acceptTerms"));
    else await completeOnboarding(actor, { ...profileFields(fd), acceptTerms: bool(fd, "acceptTerms") });
  });
  if (result?.ok) redirect("/");
  return result;
}

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await updateProfile(actor, profileFields(fd));
    revalidatePath("/settings");
    return "Profile saved.";
  });
}

export async function emailVisibilityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await setEmailVisibility(actor, bool(fd, "emailPublic"));
    revalidatePath("/settings");
    return "Saved.";
  });
}

export async function notificationSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await saveNotificationSettings(actor, {
      emailDigest: bool(fd, "emailDigest"),
      emailDecisions: bool(fd, "emailDecisions"),
      emailEventReminders: bool(fd, "emailEventReminders"),
      inAppFollowed: bool(fd, "inAppFollowed"),
    });
    return "Notification settings saved.";
  });
}

export async function avatarAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    if (fd.get("remove") === "1") {
      await removeAvatar(actor);
      revalidatePath("/settings");
      return "Profile picture removed.";
    }
    const file = fd.get("avatar");
    if (!(file instanceof File) || file.size === 0) throw new AppError("Choose an image first.");
    if (file.size > AVATAR_MAX_BYTES) throw new AppError("Images can be up to 2 MB.");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new AppError("Please upload a JPG, PNG or WebP image.");
    const r = await uploadAvatar(actor, Buffer.from(await file.arrayBuffer()), file.name);
    revalidatePath("/settings");
    return r === "approved" ? "Profile picture updated." : "Uploaded. Your new picture is visible to others after the admin approves it.";
  });
}

export async function signOutEverywhereAction(_: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return runAction(async () => {
    const actor = await actorForAction();
    await revokeOtherSessions(actor.id, actor.sessionId);
    return "Signed out on all other devices.";
  });
}

export async function requestDeletionCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return runAction(async () => {
    const actor = await actorForAction();
    await requestAccountDeletionCode(actor);
    return "We emailed you a 6-digit code. Enter it below to confirm.";
  });
}

export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const actor = await actorForAction();
    const mode = str(fd, "mode") === "delete_posts" ? "delete_posts" : "anonymise_posts";
    await deleteMyAccount(actor, str(fd, "code"), mode);
    await revokeAllSessions(actor.id);
    if (await readSessionToken()) await clearSessionCookie();
  });
  if (result?.ok) redirect("/login");
  return result;
}
