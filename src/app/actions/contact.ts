"use server";

import { getActor } from "@/server/actor";
import { runAction, str, type ActionState } from "@/server/action-utils";
import { submitContact } from "@/server/dal/contact";
import { clientIp } from "@/server/request";

export async function contactAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await getActor();
    const kind = str(fd, "kind") === "takedown" ? "takedown" : "contact";
    // A hidden field people never see; bots fill it in. Pretend it worked.
    if (str(fd, "website")) return kind === "takedown" ? "Thank you. The admin will review your request within 48 hours." : "Thank you. Your message has been sent.";
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
      void r;
      return "Thank you. The admin will review your request within 48 hours.";
    }
    return "Thank you. Your message has been sent.";
  });
}
