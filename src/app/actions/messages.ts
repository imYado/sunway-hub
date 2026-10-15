"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { actorForAction } from "@/server/actor";
import { runAction, str, type ActionState } from "@/server/action-utils";
import {
  deleteMessage,
  respondToRequest,
  revealIdentity,
  sendMessage,
  setBlocked,
  startConversation,
  type sendSchema,
  type startSchema,
} from "@/server/dal/messages";

export async function startConversationAction(input: z.input<typeof startSchema>): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const r = await startConversation(actor, input);
    revalidatePath("/messages");
    return { ok: true, data: r };
  });
}

export async function sendMessageAction(conversationId: string, input: z.input<typeof sendSchema>): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await sendMessage(actor, conversationId, input);
    revalidatePath(`/messages/${conversationId}`);
  });
}

export async function respondAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "conversationId");
    const op = str(fd, "op");
    await respondToRequest(actor, id, op === "accept_reveal" ? "accept_reveal" : op === "decline" ? "decline" : "accept");
    revalidatePath("/messages");
    revalidatePath(`/messages/${id}`);
    return op === "decline" ? "Request declined." : "Request accepted.";
  });
}

export async function conversationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "conversationId");
    const op = str(fd, "op");
    if (op === "reveal") await revealIdentity(actor, id);
    else if (op === "block") await setBlocked(actor, id, true);
    else if (op === "unblock") await setBlocked(actor, id, false);
    revalidatePath("/messages");
    revalidatePath(`/messages/${id}`);
    return op === "reveal" ? "They can now see your name." : op === "block" ? "Conversation blocked." : "Conversation unblocked.";
  });
}

export async function deleteMessageAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const { conversationId } = await deleteMessage(actor, str(fd, "messageId"));
    revalidatePath(`/messages/${conversationId}`);
    return "Message removed.";
  });
}
