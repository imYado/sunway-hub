import type { Metadata } from "next";
import { env } from "@/lib/env";
import { semesterOptions } from "@/lib/rules";
import { requireMember } from "@/server/actor";
import { clubOptionsFor } from "@/server/dal/clubs";
import { storageStatus } from "@/server/dal/uploads";
import { getSettings } from "@/server/settings";
import { NewPostForm } from "./new-post-form";

export const metadata: Metadata = { title: "New post" };

export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ type?: string; club?: string }> }) {
  const actor = await requireMember();
  const sp = await searchParams;
  const [clubs, settings, storage] = await Promise.all([clubOptionsFor(actor), getSettings(), storageStatus()]);
  const defaultType = sp.type === "event" || sp.type === "club" ? sp.type : "study";
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">Share something</h1>
      {storage.refuse && (
        <p className="surface mb-4 p-3 text-sm text-danger">
          New file uploads are paused because the site&apos;s shared storage is nearly full. You can still post without attachments.
        </p>
      )}
      <NewPostForm
        userId={actor.id}
        clubs={clubs}
        semesters={semesterOptions()}
        enabledKinds={settings.enabledFileKinds}
        storageDriver={env.storageDriver}
        defaultType={defaultType}
        defaultClubId={sp.club}
      />
    </div>
  );
}
