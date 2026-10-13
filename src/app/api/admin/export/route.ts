import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { klDayKey } from "@/lib/dates";
import { getActor } from "@/server/actor";
import { ReauthRequiredError } from "@/server/errors";
import { exportTable, EXPORTABLE_TABLE_NAMES } from "@/server/dal/export";
import { audit } from "@/server/audit";

// Admin: export one table as CSV or JSON. Requires a recent password confirmation.
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor?.isAdmin) return new Response("Not found", { status: 404 });
  const table = req.nextUrl.searchParams.get("table") ?? "";
  const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
  if (!EXPORTABLE_TABLE_NAMES.includes(table)) return NextResponse.json({ error: "Unknown table" }, { status: 400 });
  try {
    const rows = await exportTable(actor, table);
    await audit(actor, "data.export_table", { type: "table", id: table }, null, { format, rows: rows.length });
    const body = format === "json" ? JSON.stringify(rows, null, 2) : toCsv(rows);
    return new Response(body, {
      headers: {
        "Content-Type": format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${table}-${klDayKey()}.${format}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ReauthRequiredError) return NextResponse.redirect(new URL(`/admin/reauth?next=/admin/data`, req.url));
    throw err;
  }
}
