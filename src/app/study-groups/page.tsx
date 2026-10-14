import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CleanInput, CleanTextarea } from "@/components/ui/clean-input";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { Field } from "@/components/ui/field";
import { formatDate } from "@/lib/dates";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX } from "@/lib/rules";
import { createGroupAction } from "@/app/actions/schedule";
import { requireMember } from "@/server/actor";
import { myGroups } from "@/server/dal/groups";

export const metadata: Metadata = { title: "Study groups" };

export default async function StudyGroupsPage() {
  const actor = await requireMember();
  const groups = await myGroups(actor);

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle>Study groups</PageTitle>
      <p className="mb-8 text-muted">
        Make a group with your friends or classmates, share the invite link, and see which days you&apos;re all free. Groups are private to their members.
      </p>

      {groups.length === 0 ? (
        <EmptyState title="You're not in any groups yet">Make one below, or open an invite link a friend sent you.</EmptyState>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {groups.map((g) => (
            <li key={g.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <div className="min-w-0">
                <Link href={`/study-groups/${g.id}`} className="font-medium">
                  {g.name}
                </Link>
                {g.hidden && <span className="ml-2 text-sm text-muted">(under review)</span>}
                {g.description && <p className="break-words text-sm text-muted">{g.description}</p>}
              </div>
              <p className="text-sm text-muted">
                {g.members} {g.members === 1 ? "member" : "members"}
                {g.nextPlan && <> · next plan {formatDate(`${g.nextPlan}T12:00:00+08:00`)}</>}
              </p>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="g-new" className="card mt-8 p-4 sm:p-6">
        <h2 id="g-new" className="mb-4 text-lg font-semibold">
          Make a group
        </h2>
        <ActionForm action={createGroupAction}>
          <Field label="Group name" htmlFor="g-name">
            <CleanInput id="g-name" name="name" required minLength={3} maxLength={GROUP_NAME_MAX} placeholder="CSC1024 revision crew" />
          </Field>
          <Field label="What's it for? (optional)" htmlFor="g-description">
            <CleanTextarea id="g-description" name="description" rows={2} maxLength={GROUP_DESCRIPTION_MAX} />
          </Field>
          <SubmitButton>Make group</SubmitButton>
        </ActionForm>
      </section>
    </div>
  );
}
