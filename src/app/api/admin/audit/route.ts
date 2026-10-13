import { toCsv } from "@/lib/csv";
import { klDayKey } from "@/lib/dates";
import { getActor } from "@/server/actor";
import { listAudit } from "@/server/dal/admin";

export async function GET() {
  const actor = await getActor();
  if (!actor?.isAdmin) return new Response("Not found", { status: 404 });
  const rows = await listAudit(actor, { limit: 10000 });
  return new Response(toCsv(rows as unknown as Record<string, unknown>[], ["id", "at", "actorLabel", "action", "targetType", "targetId", "reason", "metadata"]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${klDayKey()}.csv"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
