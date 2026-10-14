import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate, formatTime, klDayKey } from "@/lib/dates";
import { addDays, DAY_NAMES, DAY_SHORT, formatMinutes, isDayKey, weekStart, weekdayOf } from "@/lib/schedule";
import type { ScheduleEvent } from "@/server/dal/schedule";

/** The Monday of the week asked for in ?week=, or of this week. */
export function mondayFrom(week: string | undefined): string {
  return weekStart(isDayKey(week) ? week : klDayKey());
}

export function WeekNav({ basePath, monday }: { basePath: string; monday: string }) {
  const sunday = addDays(monday, 6);
  const thisWeek = weekStart(klDayKey());
  const sep = basePath.includes("?") ? "&" : "?";
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">
        {formatDate(`${monday}T12:00:00+08:00`)} to {formatDate(`${sunday}T12:00:00+08:00`)}
      </h2>
      <div className="flex gap-2">
        <Link href={`${basePath}${sep}week=${addDays(monday, -7)}`} className="btn btn-sm">
          Previous week
        </Link>
        {monday !== thisWeek && (
          <Link href={basePath} className="btn btn-sm">
            This week
          </Link>
        )}
        <Link href={`${basePath}${sep}week=${addDays(monday, 7)}`} className="btn btn-sm">
          Next week
        </Link>
      </div>
    </div>
  );
}

export function timeRange(start: number | null, end: number | null): string {
  if (start === null) return "Any time";
  return end === null ? formatMinutes(start) : `${formatMinutes(start)}–${formatMinutes(end)}`;
}

export function DayCard({ date, children, footer }: { date: string; children: ReactNode; footer?: ReactNode }) {
  const today = date === klDayKey();
  const day = weekdayOf(date);
  const dayNumber = Number(date.slice(8));
  return (
    <section aria-label={`${DAY_NAMES[day]} ${dayNumber}`} className={`card flex min-w-0 flex-col p-3 ${today ? "border-ink" : ""}`}>
      <h3 className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-display font-extrabold">
          {DAY_SHORT[day]} {dayNumber}
        </span>
        {today && <span className="text-sm text-muted">Today</span>}
      </h3>
      <div className="flex-1 space-y-2 text-sm">{children}</div>
      {footer && <div className="mt-3 border-t border-line pt-2 text-sm">{footer}</div>}
    </section>
  );
}

export function WeekGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{children}</div>;
}

/** One line on a day: time, title and a small caption. */
export function Item({ time, title, caption, href }: { time: string; title: string; caption?: ReactNode; href?: string }) {
  return (
    <div className="min-w-0 border-l-2 border-line pl-2">
      <p className="text-muted tabular-nums">{time}</p>
      <p className="break-words font-medium">{href ? <Link href={href}>{title}</Link> : title}</p>
      {caption && <p className="break-words text-muted">{caption}</p>}
    </div>
  );
}

export function EventItem({ e }: { e: ScheduleEvent }) {
  return (
    <Item
      time={`${formatTime(e.startsAt)}${e.endsAt && klDayKey(e.endsAt) === klDayKey(e.startsAt) ? `–${formatTime(e.endsAt)}` : ""}`}
      title={e.title}
      href={`/posts/${e.id}`}
      caption={[`Event${e.clubName ? ` · ${e.clubName}` : ""}`, e.going ? "You're going" : null].filter(Boolean).join(" · ")}
    />
  );
}

export function eventsByDay(events: ScheduleEvent[]): Map<string, ScheduleEvent[]> {
  const map = new Map<string, ScheduleEvent[]>();
  for (const e of events) {
    const key = klDayKey(e.startsAt);
    map.set(key, [...(map.get(key) ?? []), e]);
  }
  return map;
}
