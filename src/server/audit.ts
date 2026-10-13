import "server-only";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import type { Actor } from "./actor-types";

export async function audit(
  actor: Pick<Actor, "id" | "username" | "isAdmin"> | null,
  action: string,
  target: { type?: string; id?: string } = {},
  reason?: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({
    actorId: actor?.id ?? null,
    actorLabel: actor ? (actor.isAdmin ? "admin" : `@${actor.username ?? actor.id.slice(0, 8)}`) : "system",
    action,
    targetType: target.type ?? null,
    targetId: target.id ?? null,
    reason: reason ?? null,
    metadata: metadata ?? null,
  });
}
