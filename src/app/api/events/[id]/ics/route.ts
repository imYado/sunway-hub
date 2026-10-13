import { env } from "@/lib/env";
import { buildIcs } from "@/lib/ics";
import { getActor } from "@/server/actor";
import { getEventForIcs } from "@/server/dal/posts";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new Response("Please sign in.", { status: 401 });
  const { id } = await params;
  try {
    const { post, event } = await getEventForIcs(actor, id);
    const ics = buildIcs({
      uid: post.id,
      title: post.title,
      description: post.description,
      location: event.location,
      start: event.startsAt,
      end: event.endsAt,
      url: `${env.appUrl}/posts/${post.id}`,
    });
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="event.ics"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
