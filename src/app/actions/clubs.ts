"use server";

import { revalidatePath } from "next/cache";
import { AVATAR_MAX_BYTES } from "@/lib/files";
import { SOCIAL_KEYS } from "@/lib/rules";
import { actorForAction } from "@/server/actor";
import { runAction, str, type ActionState } from "@/server/action-utils";
import { AppError } from "@/server/errors";
import { requestToManage, updateClubAsManager, uploadClubLogo } from "@/server/dal/clubs";

export async function requestManageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await requestToManage(actor, { clubId: str(fd, "clubId"), message: str(fd, "message"), proof: str(fd, "proof") });
    revalidatePath(str(fd, "path") || "/clubs");
    return "Request sent. The admin will review it.";
  });
}

export async function updateClubAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const socials: Record<string, string> = {};
    for (const k of SOCIAL_KEYS) socials[k] = str(fd, k);
    await updateClubAsManager(actor, str(fd, "clubId"), { description: str(fd, "description"), socials });
    revalidatePath(str(fd, "path") || "/clubs");
    return "Club details saved.";
  });
}

export async function clubLogoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const file = fd.get("logo");
    if (!(file instanceof File) || file.size === 0) throw new AppError("Choose an image first.");
    if (file.size > AVATAR_MAX_BYTES) throw new AppError("Images can be up to 2 MB.");
    const r = await uploadClubLogo(actor, str(fd, "clubId"), Buffer.from(await file.arrayBuffer()), file.name);
    revalidatePath(str(fd, "path") || "/clubs");
    return r === "approved" ? "Logo updated." : "Uploaded. The new logo appears after the admin approves it.";
  });
}
