import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageTitle } from "@/components/ui/empty";
import { EVENT_ROLE_OPTIONS } from "@/lib/rules";
import { saveEventFiltersAction } from "@/app/actions/schedule";
import { requireMember } from "@/server/actor";
import { listClubs } from "@/server/dal/clubs";
import { getCalendarPrefs } from "@/server/dal/schedule";

export const metadata: Metadata = { title: "Events on my schedule" };

const CLUB_MODES = [
  { value: "following", label: "Clubs I follow" },
  { value: "chosen", label: "Only the clubs I pick below" },
  { value: "all", label: "Every club" },
  { value: "none", label: "No club events" },
] as const;

export default async function EventFiltersPage() {
  const actor = await requireMember();
  const [prefs, clubs] = await Promise.all([getCalendarPrefs(actor), listClubs(actor)]);
  const chosen = new Set(prefs.clubIds);

  return (
    <div className="mx-auto max-w-3xl">
      <p className="mb-2 text-sm">
        <Link href="/schedule">My schedule</Link>
      </p>
      <PageTitle>Events on my schedule</PageTitle>
      <p className="mb-8 text-muted">
        Pick which events show on your schedule and on your study groups&apos; calendars. An event shows if it matches any of your choices. Events you&apos;re going to or
        interested in always show.
      </p>
      <ActionForm action={saveEventFiltersAction}>
        <fieldset className="card mb-6 p-4 sm:p-6">
          <legend className="px-1 font-semibold">Club events</legend>
          <div className="space-y-2">
            {CLUB_MODES.map((m) => (
              <label key={m.value} className="flex items-center gap-2">
                <input type="radio" name="clubs" value={m.value} defaultChecked={prefs.clubs === m.value} className="h-4 w-4" />
                {m.label}
              </label>
            ))}
          </div>
          {clubs.length > 0 && (
            <fieldset className="mt-4">
              <legend className="label">Clubs to show (when picking clubs)</legend>
              <div className="max-h-72 overflow-y-auto rounded border border-line p-3">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {clubs.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" name="clubId" value={c.id} defaultChecked={chosen.has(c.id)} className="mt-1 h-4 w-4 shrink-0" />
                        {c.name}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </fieldset>
          )}
        </fieldset>

        <fieldset className="card mb-6 p-4 sm:p-6">
          <legend className="px-1 font-semibold">Events posted by</legend>
          <div className="mb-4 space-y-2">
            {EVENT_ROLE_OPTIONS.map((r) => (
              <label key={r.value} className="flex items-center gap-2">
                <input type="checkbox" name="role" value={r.value} defaultChecked={prefs.roles.includes(r.value)} className="h-4 w-4" />
                {r.label}
              </label>
            ))}
          </div>
          <label htmlFor="people" className="label">
            Specific people (usernames)
          </label>
          <input
            id="people"
            name="people"
            defaultValue={prefs.people.map((p) => `@${p.username}`).join(", ")}
            placeholder="@alice_s, @mr_tan"
            aria-describedby="people-hint"
            className="input"
          />
          <p id="people-hint" className="hint">
            Separate usernames with commas or spaces.
          </p>
        </fieldset>
        <SubmitButton>Save</SubmitButton>
      </ActionForm>
    </div>
  );
}
