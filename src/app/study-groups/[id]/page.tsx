import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CleanInput, CleanTextarea } from "@/components/ui/clean-input";
import { CopyLinkButton } from "@/components/ui/copy-link";
import { Field } from "@/components/ui/field";
import { ReportForm } from "@/components/report-form";
import { DayCard, EventItem, eventsByDay, Item, mondayFrom, timeRange, WeekGrid, WeekNav } from "@/components/schedule/week";
import { klDayKey } from "@/lib/dates";
import { env } from "@/lib/env";
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, PLAN_KINDS, PLAN_NOTES_MAX, TIMETABLE_LABEL_MAX, TITLE_MAX } from "@/lib/rules";
import { addDays, describeWindows, isDayKey, klDayStart } from "@/lib/schedule";
import {
  createPlanAction,
  deleteGroupAction,
  deletePlanAction,
  leaveGroupAction,
  removeMemberAction,
  resetInviteAction,
  togglePlanGoingAction,
  updateGroupAction,
} from "@/app/actions/schedule";
import { requireMember } from "@/server/actor";
import { NotFoundError } from "@/server/errors";
import { getGroupWeek } from "@/server/dal/groups";
import { eventsForSchedule } from "@/server/dal/schedule";

export const metadata: Metadata = { title: "Study group" };

const KIND_LABEL = Object.fromEntries(PLAN_KINDS.map((k) => [k.value, k.label])) as Record<string, string>;

export default async function GroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ week?: string; plan?: string }> }) {
  const actor = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const monday = mondayFrom(sp.week);
  let data;
  try {
    data = await getGroupWeek(actor, id, monday);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { group: g, isOwner, members, withTimetable, week, inviteCode } = data;
  const events = eventsByDay(await eventsForSchedule(actor, klDayStart(monday), klDayStart(addDays(monday, 7))));
  const base = `/study-groups/${g.id}`;
  const planDate = isDayKey(sp.plan) ? sp.plan : klDayKey();
  const noTimetable = members.length - withTimetable;

  return (
    <div>
      <p className="mb-2 text-sm">
        <Link href="/study-groups">Study groups</Link>
      </p>
      {g.hiddenByReports && <p className="surface mb-4 p-3 text-sm text-danger">This group is hidden from its members while the admin reviews reports about it.</p>}
      <h1 className="text-xl font-semibold">{g.name}</h1>
      {g.description && <p className="mt-2 max-w-3xl whitespace-pre-wrap break-words">{g.description}</p>}
      <p className="mb-8 mt-2 text-sm text-muted">
        {members.length} {members.length === 1 ? "member" : "members"}.{" "}
        {noTimetable > 0 && withTimetable > 0 && `${noTimetable} haven't added a timetable yet, so free times only count the others.`}
        {withTimetable === 0 && (
          <>
            Nobody has added a timetable yet. <Link href="/schedule/timetable">Add yours</Link> to see when everyone is free.
          </>
        )}
      </p>

      <WeekNav basePath={base} monday={monday} />
      <WeekGrid>
        {week.map((d) => (
          <DayCard
            key={d.date}
            date={d.date}
            footer={
              g.member && (
                <Link href={`${base}?week=${monday}&plan=${d.date}#plan`} className="font-medium">
                  Plan something<span className="sr-only"> on {d.date}</span>
                </Link>
              )
            }
          >
            {withTimetable > 0 && (
              <p>
                <span className="text-muted">Everyone free: </span>
                <span className="font-medium">{describeWindows(d.free)}</span>
              </p>
            )}
            {d.plans.map((p) => (
              <div key={p.id}>
                <Item
                  time={timeRange(p.startMin, p.endMin)}
                  title={p.title}
                  caption={[KIND_LABEL[p.kind], p.location, `${p.going} going`].filter(Boolean).join(" · ")}
                />
                {p.notes && <p className="mt-1 whitespace-pre-wrap break-words pl-2 text-muted">{p.notes}</p>}
                <div className="mt-1 flex flex-wrap gap-2 pl-2">
                  {g.member && (
                    <ActionForm action={togglePlanGoingAction}>
                      <input type="hidden" name="planId" value={p.id} />
                      <SubmitButton variant={p.imGoing ? "default" : "primary"} size="sm">
                        {p.imGoing ? "Not going" : "I'm going"}
                        <span className="sr-only"> to {p.title}</span>
                      </SubmitButton>
                    </ActionForm>
                  )}
                  {(p.createdBy === actor.id || isOwner || actor.isAdmin) && (
                    <ActionForm action={deletePlanAction} confirm="Delete this plan?">
                      <input type="hidden" name="planId" value={p.id} />
                      <SubmitButton variant="danger" size="sm">
                        Delete<span className="sr-only"> {p.title}</span>
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </div>
            ))}
            {(events.get(d.date) ?? []).map((e) => (
              <EventItem key={e.id} e={e} />
            ))}
          </DayCard>
        ))}
      </WeekGrid>
      <p className="mt-3 text-sm text-muted">
        Free times are between 08:00 and 22:00 and at least an hour long. Events shown are the ones you <Link href="/schedule/events">chose for your schedule</Link>.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[3fr_2fr]">
        {g.member && (
          <section id="plan" aria-labelledby="g-plan" className="card scroll-mt-24 p-4 sm:p-6">
            <h2 id="g-plan" className="mb-4 text-lg font-semibold">
              Plan something
            </h2>
            <ActionForm action={createPlanAction} resetOnSuccess key={planDate}>
              <input type="hidden" name="groupId" value={g.id} />
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="What" htmlFor="plan-title">
                  <CleanInput id="plan-title" name="title" required maxLength={TITLE_MAX} placeholder="Revise chapter 4" />
                </Field>
                <Field label="Kind" htmlFor="plan-kind">
                  <select id="plan-kind" name="kind" className="input">
                    {PLAN_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid gap-x-4 sm:grid-cols-3">
                <Field label="Date" htmlFor="plan-date">
                  <input id="plan-date" name="date" type="date" required defaultValue={planDate} className="input" />
                </Field>
                <Field label="Starts (optional)" htmlFor="plan-start">
                  <input id="plan-start" name="start" type="time" className="input" />
                </Field>
                <Field label="Ends (optional)" htmlFor="plan-end">
                  <input id="plan-end" name="end" type="time" className="input" />
                </Field>
              </div>
              <Field label="Where (optional)" htmlFor="plan-location">
                <CleanInput id="plan-location" name="location" maxLength={TIMETABLE_LABEL_MAX} placeholder="Library level 3" />
              </Field>
              <Field label="Notes (optional)" htmlFor="plan-notes">
                <CleanTextarea id="plan-notes" name="notes" rows={2} maxLength={PLAN_NOTES_MAX} />
              </Field>
              <SubmitButton>Add plan</SubmitButton>
            </ActionForm>
          </section>
        )}

        <div className="space-y-8">
          <section aria-labelledby="g-members">
            <h2 id="g-members" className="mb-3 text-lg font-semibold">
              Members
            </h2>
            <ul className="divide-y divide-line border-y border-line">
              {members.map((m) => (
                <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0">
                    <Link href={`/u/${m.username}`}>{m.name ?? `@${m.username}`}</Link>
                    <span className="text-sm text-muted">
                      {m.isOwner && " · runs the group"}
                      {!m.hasTimetable && " · no timetable yet"}
                    </span>
                  </span>
                  {(isOwner || actor.isAdmin) && m.userId !== actor.id && (
                    <ActionForm action={removeMemberAction} confirm={`Remove ${m.name ?? m.username} from the group?`}>
                      <input type="hidden" name="groupId" value={g.id} />
                      <input type="hidden" name="userId" value={m.userId} />
                      <SubmitButton variant="default" size="sm">
                        Remove<span className="sr-only"> {m.name ?? m.username}</span>
                      </SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {inviteCode && (
            <section aria-labelledby="g-invite">
              <h2 id="g-invite" className="mb-2 text-lg font-semibold">
                Invite people
              </h2>
              <label htmlFor="invite-link" className="label">
                Invite link
              </label>
              <input id="invite-link" readOnly value={`${env.appUrl}/study-groups/join/${inviteCode}`} aria-describedby="invite-hint" className="input mb-1" />
              <p id="invite-hint" className="hint mb-3">
                Anyone signed in to SJ Study with this link can join.
              </p>
              <div className="flex flex-wrap gap-2">
                <CopyLinkButton path={`/study-groups/join/${inviteCode}`} />
                {isOwner && (
                  <ActionForm action={resetInviteAction} confirm="Make a new link? The old one will stop working.">
                    <input type="hidden" name="groupId" value={g.id} />
                    <SubmitButton variant="default" size="sm">
                      New link
                    </SubmitButton>
                  </ActionForm>
                )}
              </div>
            </section>
          )}

          {isOwner && (
            <section aria-labelledby="g-settings">
              <h2 id="g-settings" className="mb-3 text-lg font-semibold">
                Group settings
              </h2>
              <ActionForm action={updateGroupAction}>
                <input type="hidden" name="groupId" value={g.id} />
                <Field label="Group name" htmlFor="g-name">
                  <CleanInput id="g-name" name="name" required minLength={3} maxLength={GROUP_NAME_MAX} defaultValue={g.name} />
                </Field>
                <Field label="What's it for?" htmlFor="g-description">
                  <CleanTextarea id="g-description" name="description" rows={2} maxLength={GROUP_DESCRIPTION_MAX} defaultValue={g.description} />
                </Field>
                <SubmitButton variant="default" size="sm">
                  Save
                </SubmitButton>
              </ActionForm>
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            {g.member && (
              <ActionForm
                action={leaveGroupAction}
                confirm={isOwner && members.length > 1 ? "Leave the group? The longest-standing member will run it." : "Leave this group?"}
              >
                <input type="hidden" name="groupId" value={g.id} />
                <SubmitButton variant="default" size="sm">
                  Leave group
                </SubmitButton>
              </ActionForm>
            )}
            {isOwner && (
              <ActionForm action={deleteGroupAction} confirm="Delete this group and its plans for everyone?">
                <input type="hidden" name="groupId" value={g.id} />
                <SubmitButton variant="danger" size="sm">
                  Delete group
                </SubmitButton>
              </ActionForm>
            )}
          </div>
          {actor.isAdmin && !isOwner && (
            <ActionForm action={deleteGroupAction} confirm="Delete this group?">
              <input type="hidden" name="groupId" value={g.id} />
              <Field label="Reason (sent to the members)" htmlFor="g-del-reason">
                <CleanTextarea id="g-del-reason" name="reason" required maxLength={500} rows={2} />
              </Field>
              <SubmitButton variant="danger" size="sm">
                Delete group as admin
              </SubmitButton>
            </ActionForm>
          )}
          {g.member && !isOwner && <ReportForm targetType="study_group" targetId={g.id} />}
        </div>
      </div>
    </div>
  );
}
