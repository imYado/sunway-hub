import { getActor } from "@/server/actor";
import { getDmFileForViewer } from "@/server/dal/messages";
import { encryptedImageResponse } from "@/server/file-response";

// Images in private messages: only the two people in the conversation (and the admin, once it is reported).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor || !actor.onboarded) return new Response("Please sign in.", { status: 401 });
  const { id } = await params;
  const file = await getDmFileForViewer(actor, id);
  if (!file) return new Response("Not found", { status: 404 });
  return encryptedImageResponse(file);
}
