import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runDailyJobs } from "@/server/cron";

export const maxDuration = 300;

function authorised(req: NextRequest): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

// Vercel Cron calls this once a day with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const results = await runDailyJobs();
  return NextResponse.json({ ok: true, results });
}
