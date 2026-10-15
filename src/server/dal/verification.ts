import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { Actor } from "../actor-types";
import { ForbiddenError } from "../errors";

export const UNVERIFIED_MESSAGE =
  "Your Sunway email isn't verified yet, so this is not available. Email hubsunway@gmail.com from your university email to get verified.";

export async function isSunwayVerified(userId: string): Promise<boolean> {
  const [u] = await db.select({ v: users.sunwayVerified }).from(users).where(eq(users.id, userId)).limit(1);
  return !!u?.v;
}

/** Market posts and new private messages need a verified Sunway member. */
export async function assertSunwayVerified(actor: Actor): Promise<void> {
  if (actor.isAdmin) return;
  if (!(await isSunwayVerified(actor.id))) throw new ForbiddenError(UNVERIFIED_MESSAGE);
}
