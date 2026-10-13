import type { NextRequest } from "next/server";
import { getActor } from "@/server/actor";
import { getFileForViewer } from "@/server/dal/posts";
import { fileResponse } from "@/server/file-response";

// Attachments: viewer must be signed in, and the post must be approved (or the viewer is the owner or admin).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor || !actor.onboarded) return new Response("Please sign in.", { status: 401 });
  const { id } = await params;
  const file = await getFileForViewer(actor, id);
  if (!file) return new Response("Not found", { status: 404 });
  return fileResponse(file, { download: req.nextUrl.searchParams.get("download") === "1", range: req.headers.get("range") });
}
