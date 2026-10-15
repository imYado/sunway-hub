import "server-only";
import { isSunwayVerified } from "./verification";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contactMessages, posts, users } from "@/db/schema";
import { env } from "@/lib/env";
import { isValidEmailShape, normaliseEmail } from "@/lib/email-domain";
import type { Actor } from "../actor-types";
import { audit } from "../audit";
import { AppError } from "../errors";
import { assertClean } from "../profanity";
import { enforce, LIMITS } from "../rate-limit";
import { notify } from "./notifications";

export const contactSchema = z.object({
  kind: z.enum(["contact", "takedown"]),
  name: z.string().trim().min(2, "Enter your name.").max(100),
  email: z.string().trim().max(254),
  subject: z.string().trim().max(150).optional().default(""),
  message: z.string().trim().min(10, "Please write a little more.").max(3000),
  contentUrl: z.string().trim().max(500).optional().default(""),
});

/** Finds a post id in a link to this site, e.g. https://site/posts/<uuid>. */
export function postIdFromUrl(url: string): string | null {
  const m = /\/posts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Contact and takedown requests (also available to logged-out visitors).
 * A takedown that names a post on this site hides it immediately while the admin reviews.
 */
export async function submitContact(actor: Actor | null, raw: z.input<typeof contactSchema>, ipKey: string): Promise<{ hidden: boolean }> {
  const input = contactSchema.parse(raw);
  await enforce("contact", ipKey, LIMITS.contactPerIp.limit, LIMITS.contactPerIp.window);
  await enforce("contact-day", ipKey, LIMITS.contactPerIpDay.limit, LIMITS.contactPerIpDay.window);
  const email = normaliseEmail(input.email);
  if (!isValidEmailShape(email)) throw new AppError("Enter a valid email address so we can reply.");
  const local = email.split("@")[0];
  await assertClean(input.name, input.subject, input.message, input.contentUrl, local.replace(/[._+-]+/g, " "), local.replace(/[._+-]+/g, ""));
  let hiddenPostId: string | null = null;
  if (input.kind === "takedown") {
    if (!input.contentUrl) throw new AppError("Add the link to the content you want removed.");
    const id = postIdFromUrl(input.contentUrl);
    // Takedowns are only for posts on this site, so the link must point at one.
    if (!id) throw new AppError("Paste the link to the post on SJ Study, for example https://.../posts/... .");
    const [exists] = await db.select({ id: posts.id }).from(posts).where(eq(posts.id, id)).limit(1);
    if (!exists) throw new AppError("We couldn't find that post. Check the link and try again.");
    // Only signed-in, verified members can hide a post straight away; anyone else's
    // request waits for the admin, or a stranger could hide any post.
    if (actor && !actor.guest && (await isSunwayVerified(actor.id))) {
      const [p] = await db
        .select({ id: posts.id, authorEmail: users.email })
        .from(posts)
        .innerJoin(users, eq(users.id, posts.authorId))
        .where(eq(posts.id, id))
        .limit(1);
      if (p && p.authorEmail !== env.adminEmail) {
        await db.update(posts).set({ hiddenByReports: true }).where(eq(posts.id, id));
        hiddenPostId = id;
        await audit(null, "post.hidden_by_takedown", { type: "post", id });
      }
    }
  }
  await db.insert(contactMessages).values({
    kind: input.kind,
    userId: actor?.id ?? null,
    name: input.name,
    email,
    subject: input.subject || null,
    message: input.message,
    contentUrl: input.contentUrl || null,
    hiddenPostId,
  });
  // Let the admin know in-app (and in their daily email digest).
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.email, env.adminEmail)).limit(1);
  if (admin) {
    await notify([admin.id], {
      kind: "system",
      title: input.kind === "takedown" ? "New takedown request (48 h target)" : "New contact message",
      link: "/admin/messages",
    });
  }
  return { hidden: !!hiddenPostId };
}
