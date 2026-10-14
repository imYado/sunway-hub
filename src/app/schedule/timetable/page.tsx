import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CleanInput } from "@/components/ui/clean-input";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { Field } from "@/components/ui/field";
import { timeRange } from "@/components/schedule/week";
import { TIMETABLE_LABEL_MAX, TIMETABLE_MAX_ENTRIES } from "@/lib/rules";
import { DAY_NAMES } from "@/lib/schedule";
import { addSlotAction, clearTimetableAction, importTimetableAction, removeSlotAction } from "@/app/actions/schedule";
import { requireMember } from "@/server/actor";
import { myTimetable } from "@/server/dal/schedule";

export const metadata: Metadata = { title: "My timetable" };

export default async function TimetablePage() {
  const actor = await requireMember();
  const slots = await myTimetable(actor);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-2 text-sm">
        <Link href="/schedule">My schedule</Link>
      </p>
      <PageTitle>My timetable</PageTitle>
      <p className="mb-8 text-muted">
        Your weekly classes. Your study groups only see when you&apos;re busy, never what the class is or where.
      </p>

      <section aria-labelledby="t-upload" className="card mb-6 p-4 sm:p-6">
        <h2 id="t-upload" className="text-lg font-semibold">
          Upload a calendar file
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          Use a .ics file from your student portal, Google Calendar (Settings, Import and export, Export), Outlook or Apple Calendar. Every class becomes a weekly slot. The file
          itself isn&apos;t kept.
        </p>
        <ActionForm action={importTimetableAction}>
          <Field label="Calendar file (.ics)" htmlFor="ics-file">
            <input id="ics-file" name="file" type="file" accept=".ics,text/calendar" required className="input" />
          </Field>
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input type="checkbox" name="replace" defaultChecked className="h-4 w-4" />
            Replace my current timetable
          </label>
          <SubmitButton>Upload</SubmitButton>
        </ActionForm>
      </section>

      <section aria-labelledby="t-add" className="card mb-8 p-4 sm:p-6">
        <h2 id="t-add" className="mb-4 text-lg font-semibold">
          Add a class by hand
        </h2>
        <ActionForm action={addSlotAction} resetOnSuccess>
          <div className="grid gap-x-4 sm:grid-cols-3">
            <Field label="Day" htmlFor="slot-day">
              <select id="slot-day" name="day" className="input">
                {DAY_NAMES.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Starts" htmlFor="slot-start">
              <input id="slot-start" name="start" type="time" required className="input" />
            </Field>
            <Field label="Ends" htmlFor="slot-end">
              <input id="slot-end" name="end" type="time" required className="input" />
            </Field>
          </div>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Class" htmlFor="slot-label">
              <CleanInput id="slot-label" name="label" required maxLength={TIMETABLE_LABEL_MAX} placeholder="CSC1024 Lecture" />
            </Field>
            <Field label="Room (optional)" htmlFor="slot-location">
              <CleanInput id="slot-location" name="location" maxLength={TIMETABLE_LABEL_MAX} />
            </Field>
          </div>
          <SubmitButton>Add class</SubmitButton>
        </ActionForm>
      </section>

      <section aria-labelledby="t-list">
        <h2 id="t-list" className="mb-3 text-lg font-semibold">
          Your week ({slots.length} of {TIMETABLE_MAX_ENTRIES} slots)
        </h2>
        {slots.length === 0 ? (
          <EmptyState title="No classes yet">Upload a calendar file or add your classes above.</EmptyState>
        ) : (
          <>
            <div className="space-y-6">
              {DAY_NAMES.map((name, day) => {
                const list = slots.filter((s) => s.day === day);
                if (!list.length) return null;
                return (
                  <div key={name}>
                    <h3 className="mb-2 font-semibold">{name}</h3>
                    <ul className="divide-y divide-line border-y border-line">
                      {list.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                          <span className="w-28 tabular-nums text-muted">{timeRange(s.startMin, s.endMin)}</span>
                          <span className="min-w-0 flex-1 break-words">
                            {s.label}
                            {s.location && <span className="text-muted"> · {s.location}</span>}
                          </span>
                          <ActionForm action={removeSlotAction}>
                            <input type="hidden" name="id" value={s.id} />
                            <SubmitButton variant="default" size="sm">
                              Remove<span className="sr-only"> {s.label} on {name}</span>
                            </SubmitButton>
                          </ActionForm>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <ActionForm action={clearTimetableAction} confirm="Remove every class from your timetable?" className="mt-6">
              <SubmitButton variant="danger" size="sm">
                Clear timetable
              </SubmitButton>
            </ActionForm>
          </>
        )}
      </section>
    </div>
  );
}
