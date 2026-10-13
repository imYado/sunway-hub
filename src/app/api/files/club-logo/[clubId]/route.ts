import type { NextRequest } from "next/server";
import { z } from "zod";
import { getActor } from "@/server/actor";
import { getClubLogoForViewer } from "@/server/dal/clubs";
import { fileResponse } from "@/server/file-response";

export async function GET(req: NextRequest, { params }: { params: Promise<{ clubId: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("Please sign in.", { status: 401 });
  const { clubId } = await params;
  if (!z.string().uuid().safeParse(clubId).success) return new Response("Not found", { status: 404 });
  const pending = req.nextUrl.searchParams.get("pending") === "1";
  const file = await getClubLogoForViewer(actor, clubId, pending);
  if (!file) return new Response("Not found", { status: 404 });
  return fileResponse(file, { cacheSeconds: pending ? 0 : 300 });
}
