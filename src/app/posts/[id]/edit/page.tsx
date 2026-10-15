import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { toKlInputValue } from "@/lib/dates";
import { semesterOptions } from "@/lib/rules";
import { requireMember } from "@/server/actor";
import { NotFoundError } from "@/server/errors";
import { allClubOptions, clubOptionsFor } from "@/server/dal/clubs";
import { getPostDetail } from "@/server/dal/posts";
import { getSettings } from "@/server/settings";
import { PostForm } from "@/components/posts/post-form";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireMember();
  let post;
  try {
    post = await getPostDetail(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  // Only the poster edits. The admin can hide or delete, not edit.
  if (!post.viewer.canEdit) notFound();
  const [clubs, allClubs, settings] = await Promise.all([clubOptionsFor(actor), allClubOptions(), getSettings()]);
  const semesters = semesterOptions();
  if (post.semester && !semesters.includes(post.semester)) semesters.push(post.semester);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Edit post</h1>
      <PostForm
        userId={actor.id}
        clubs={clubs}
        allClubs={allClubs}
        semesters={semesters}
        enabledKinds={settings.enabledFileKinds}
        storageDriver={env.storageDriver}
        post={{
          id: post.id,
          type: post.type,
          title: post.title,
          description: post.description,
          tags: post.subjects.map((s) => s.name),
          semester: post.semester,
          clubId: post.clubId,
          anonymous: post.anonymous,
          links: post.links,
          files: post.files.map((f) => ({ id: f.id, name: f.name, size: f.size })),
          event: post.event
            ? {
                startsAt: toKlInputValue(post.event.startsAt),
                endsAt: post.event.endsAt ? toKlInputValue(post.event.endsAt) : "",
                location: post.event.location,
                capacity: post.event.capacity,
              }
            : null,
        }}
      />
    </div>
  );
}
