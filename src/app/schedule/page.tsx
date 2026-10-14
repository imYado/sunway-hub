import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/ui/empty";
import { DayCard, EventItem, eventsByDay, Item, mondayFrom, timeRange, WeekGrid, WeekNav } from "@/components/schedule/week";
import { addDays, klDayStart, klMinutes, weekDays, weekdayOf } from "@/lib/schedule";
import { requireMember } from "@/server/actor";
import { myPlans } from "@/server/dal/groups";
import { eventsForSchedule, myTimetable } from "@/server/dal/schedule";

export const metadata: Metadata = { title: "My schedule" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const actor = await requireMember();
  const monday = mondayFrom((await searchParams).week);
  const days = weekDays(monday);
  const [timetable, plans, events] = await Promise.all([
    myTimetable(actor),
    myPlans(actor, days[0], days[6]),
    eventsForSchedule(actor, klDayStart(monday), klDayStart(addDays(monday, 7))),
  ]);
  const eventMap = eventsByDay(events);

  return (
    <div>
      <PageTitle
        actions={
          <>
            <Link href="/schedule/timetable" className="btn btn-sm">
              Edit timetable
            </Link>
            <Link href="/schedule/events" className="btn btn-sm">
              Choose events
            </Link>
          </>
        }
      >
        My schedule
      </PageTitle>
      {timetable.length === 0 && (
        <p className="surface mb-6 p-4">
          Add your class timetable so your study groups can see when you&apos;re free. <Link href="/schedule/timetable">Add your timetable</Link>
        </p>
      )}
      <WeekNav basePath="/schedule" monday={monday} />
      <WeekGrid>
        {days.map((date) => {
          const classes = timetable.filter((t) => t.day === weekdayOf(date));
          const dayPlans = plans.filter((p) => p.date === date);
          const dayEvents = eventMap.get(date) ?? [];
          // Everything on the day, in time order. Plans without a time go first.
          const items = [
            ...classes.map((c) => ({ at: c.startMin, node: <Item key={c.id} time={timeRange(c.startMin, c.endMin)} title={c.label} caption={c.location || "Class"} /> })),
            ...dayPlans.map((p) => ({
              at: p.startMin ?? -1,
              node: (
                <Item
                  key={p.id}
                  time={timeRange(p.startMin, p.endMin)}
                  title={p.title}
                  href={`/study-groups/${p.groupId}?week=${monday}`}
                  caption={`${p.groupName}${p.imGoing ? " · You're going" : ""}`}
                />
              ),
            })),
            ...dayEvents.map((e) => ({ at: klMinutes(e.startsAt), node: <EventItem key={e.id} e={e} /> })),
          ];
          items.sort((a, b) => a.at - b.at);
          return (
            <DayCard key={date} date={date}>
              {items.length ? items.map((i) => i.node) : <p className="text-muted">Nothing on</p>}
            </DayCard>
          );
        })}
      </WeekGrid>
      <p className="mt-6 text-sm text-muted">
        Classes come from your timetable, plans from your <Link href="/study-groups">study groups</Link>, and events from the clubs and people you <Link href="/schedule/events">chose</Link>.
      </p>
    </div>
  );
}
