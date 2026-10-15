"use server";

import { revalidatePath } from "next/cache";
import { actorForAction } from "@/server/actor";
import { runAction, str, type ActionState } from "@/server/action-utils";
import { removeFriend, respondToFriendRequest, sendFriendRequest } from "@/server/dal/friends";

/** One action for every friend button: add, accept, decline, cancel and unfriend. */
export async function friendAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const userId = str(fd, "userId");
    const op = str(fd, "op");
    if (op === "add") await sendFriendRequest(actor, userId);
    else if (op === "accept") await respondToFriendRequest(actor, userId, true);
    else if (op === "decline") await respondToFriendRequest(actor, userId, false);
    else await removeFriend(actor, userId);
    revalidatePath(str(fd, "path") || "/friends");
    revalidatePath("/friends");
  });
}
