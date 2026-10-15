import type { Metadata } from "next";
import { env } from "@/lib/env";
import { POST_TYPES, semesterOptions, type PostType } from "@/lib/rules";
import { requireMember } from "@/server/actor";
import { allClubOptions, clubOptionsFor } from "@/server/dal/clubs";
import { storageStatus } from "@/server/dal/uploads";
import { getSettings } from "@/server/settings";
import { PostForm } from "@/components/posts/post-form";

export const metadata: Metadata = { title: "New post" };

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ type?: string; club?: string }> }) {
  const actor = await requireMember();
  const sp = await searchParams;
  const [clubs, allClubs, settings, storage] = await Promise.all([clubOptionsFor(actor), allClubOptions(), getSettings(), storageStatus()]);
  const defaultType: PostType = POST_TYPES.some((t) => t.value === sp.type) ? (sp.type as PostType) : "discussion";
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">New post</h1>
      {storage.refuse && (
        <p className="surface mb-4 p-3 text-sm text-danger">
          New file uploads are paused because the site&apos;s shared storage is nearly full. You can still post without attachments.
        </p>
      )}
      <PostForm
        userId={actor.id}
        clubs={clubs}
        allClubs={allClubs}
        semesters={semesterOptions()}
        enabledKinds={settings.enabledFileKinds}
        storageDriver={env.storageDriver}
        defaultType={defaultType === "club" && clubs.length === 0 ? "discussion" : defaultType}
        defaultClubId={sp.club}
      />
    </div>
  );
}
