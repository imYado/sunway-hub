"use server";

import { getActor } from "@/server/actor";
import { runAction, str, type ActionState } from "@/server/action-utils";
import { submitContact } from "@/server/dal/contact";
import { clientIp } from "@/server/request";

export async function contactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await getActor();
    const kind = str(fd, "kind") === "takedown" ? "takedown" : "contact";
    const r = await submitContact(
      actor,
      {
        kind,
        name: str(fd, "name"),
        email: str(fd, "email"),
        subject: str(fd, "subject"),
        message: str(fd, "message"),
        contentUrl: str(fd, "contentUrl"),
      },
      await clientIp(),
    );
    if (kind === "takedown") {
      return r.hidden
        ? "Thank you. The content has been hidden while the admin reviews your request (target: within 48 hours)."
        : "Thank you. The admin will review your request within 48 hours.";
    }
    return "Thank you. Your message has been sent.";
  });
}
