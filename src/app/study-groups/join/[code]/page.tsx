import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { joinGroupAction } from "@/app/actions/schedule";
import { requireMember } from "@/server/actor";
import { NotFoundError } from "@/server/errors";
import { previewInvite } from "@/server/dal/groups";

export const metadata: Metadata = { title: "Join a study group" };

export default async function JoinGroupPage({ params }: { params: Promise<{ code: string }> }) {
  const actor = await requireMember();
  const { code } = await params;
  let g;
  try {
    g = await previewInvite(actor, code);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  return (
    <div className="mx-auto max-w-xl">
      <p className="mb-2 text-sm text-muted">You&apos;re invited to a study group</p>
      <h1 className="text-xl font-semibold">{g.name}</h1>
      {g.description && <p className="mt-2 whitespace-pre-wrap break-words">{g.description}</p>}
      <p className="mt-2 text-sm text-muted">
        {g.members} {g.members === 1 ? "member" : "members"}
        {g.owner?.username && <> · run by @{g.owner.username}</>}
      </p>
      {g.joined ? (
        <p className="mt-6">
          You&apos;re already in this group. <Link href={`/study-groups/${g.id}`}>Open it</Link>
        </p>
      ) : g.full ? (
        <p className="surface mt-6 p-3">This group is full.</p>
      ) : (
        <ActionForm action={joinGroupAction} className="mt-6">
          <input type="hidden" name="code" value={code} />
          <p className="mb-3 text-sm text-muted">
            Members see your name, and when you&apos;re busy or free from your timetable. They don&apos;t see your class names or rooms.
          </p>
          <SubmitButton>Join group</SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
