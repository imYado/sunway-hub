import type { NextRequest } from "next/server";
import { z } from "zod";
import { getViewer } from "@/server/actor";
import { getAvatarFileForViewer } from "@/server/dal/users";
import { fileResponse } from "@/server/file-response";

// Approved avatars: any signed-in member. Pending avatars: the owner and the admin only.
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const actor = await getViewer();
  if (!actor) return new Response("Please sign in.", { status: 401 });
  const { userId } = await params;
  if (!z.string().uuid().safeParse(userId).success) return new Response("Not found", { status: 404 });
  const pending = req.nextUrl.searchParams.get("pending") === "1";
  const file = await getAvatarFileForViewer(actor, userId, pending);
  if (!file) return new Response("Not found", { status: 404 });
  return fileResponse(file, { cacheSeconds: pending ? 0 : 300 });
}
