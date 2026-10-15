import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { formatDate, formatTime, klDayKey, klYearMonth } from "@/lib/dates";
import { requireMember } from "@/server/actor";
import { listEvents, type EventListItem } from "@/server/dal/posts";

export const metadata: Metadata = { title: "Events" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function klMonthStart(year: number, month: number): Date {
  return new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+08:00`);
}

function Calendar({ year, month, events }: { year: number; month: number; events: EventListItem[] }) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const cells: (number | null)[] = [...Array(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const byDay = new Map<string, EventListItem[]>();
  for (const e of events) {
    const key = klDayKey(e.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
        <caption className="sr-only">
          Events in {MONTHS[month - 1]} {year}
        </caption>
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col" className="border border-line bg-surface p-2 text-left font-medium">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: cells.length / 7 }, (_, w) => (
            <tr key={w}>
              {cells.slice(w * 7, w * 7 + 7).map((day, i) => {
                const key = day ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` : `empty-${w}-${i}`;
                const list = day ? (byDay.get(key) ?? []) : [];
                return (
                  <td key={key} className="h-24 border border-line p-1 align-top">
                    {day && <span className="text-muted">{day}</span>}
                    <ul className="mt-1 space-y-1">
                      {list.map((e) => (
                        <li key={e.id}>
                          <Link href={`/posts/${e.id}`} className="block truncate">
                            {formatTime(e.startsAt)} {e.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ view?: string; month?: string }> }) {
  const actor = await requireMember({ guestOk: true });
  const sp = await searchParams;
  const view = sp.view === "calendar" ? "calendar" : "list";
  const now = klYearMonth(new Date());
  const m = /^(\d{4})-(\d{2})$/.exec(sp.month ?? "");
  const year = m ? Number(m[1]) : now.year;
  const month = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[2]) : now.month;
  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;

  const events =
    view === "calendar"
      ? await listEvents(actor, { from: klMonthStart(year, month), to: klMonthStart(Number(next.slice(0, 4)), Number(next.slice(5))) })
      : await listEvents(actor, { from: new Date(), limit: 100 });

  return (
    <div>
      <PageTitle
        actions={
          <>
            <Link href="/events" className={`btn btn-sm ${view === "list" ? "btn-primary" : ""}`} aria-current={view === "list" ? "page" : undefined}>
              List
            </Link>
            <Link
              href="/events?view=calendar"
              className={`btn btn-sm ${view === "calendar" ? "btn-primary" : ""}`}
              aria-current={view === "calendar" ? "page" : undefined}
            >
              Calendar
            </Link>
            <Link href="/posts/new?type=event" className="btn btn-sm">
              Add event
            </Link>
          </>
        }
      >
        Events
      </PageTitle>
      {view === "calendar" ? (
        <>
          <div className="mb-4 flex items-center justify-between">
            <Link href={`/events?view=calendar&month=${prev}`} className="btn btn-sm">
              Previous
            </Link>
            <h2 className="text-lg font-semibold">
              {MONTHS[month - 1]} {year}
            </h2>
            <Link href={`/events?view=calendar&month=${next}`} className="btn btn-sm">
              Next
            </Link>
          </div>
          <Calendar year={year} month={month} events={events} />
        </>
      ) : events.length === 0 ? (
        <EmptyState title="No upcoming events">Club managers and members can add events. They appear here after approval.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="card flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="w-32 shrink-0 text-sm">
                <p className="font-medium">{formatDate(e.startsAt)}</p>
                <p className="text-muted">{formatTime(e.startsAt)}</p>
              </div>
              <div className="min-w-0">
                <Link href={`/posts/${e.id}`} className="font-medium">
                  {e.title}
                </Link>
                <p className="text-sm text-muted">
                  {e.location}
                  {e.club && (
                    <>
                      {" · "}
                      <Link href={`/clubs/${e.club.slug}`}>{e.club.name}</Link>
                    </>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
