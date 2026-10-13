import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/server/actor";
import { suggestSubjects } from "@/server/dal/posts";

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const rows = await suggestSubjects(q);
  return NextResponse.json({ subjects: rows.map((r) => r.name) }, { headers: { "Cache-Control": "private, no-store" } });
}
