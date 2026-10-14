import { getActor } from "@/server/actor";
import { exportMyData } from "@/server/dal/users";
import { klDayKey } from "@/lib/dates";

export async function GET() {
  const actor = await getActor();
  if (!actor) return new Response("Please sign in.", { status: 401 });
  const data = await exportMyData(actor);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="sj-study-my-data-${klDayKey()}.json"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
