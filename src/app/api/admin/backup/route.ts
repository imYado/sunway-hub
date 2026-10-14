import { NextResponse, type NextRequest } from "next/server";
import { klDayKey } from "@/lib/dates";
import { getActor } from "@/server/actor";
import { ReauthRequiredError } from "@/server/errors";
import { fullBackup } from "@/server/dal/export";

// Admin: one-click full database backup (JSON). Requires a recent password confirmation.
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor?.isAdmin) return new Response("Not found", { status: 404 });
  try {
    const data = await fullBackup(actor);
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="sj-study-backup-${klDayKey()}.json"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ReauthRequiredError) return NextResponse.redirect(new URL(`/admin/reauth?next=/admin/data`, req.url));
    throw err;
  }
}
