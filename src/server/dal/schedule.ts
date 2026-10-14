import "server-only";
import { and, asc, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { clubFollows, clubs, eventRsvps, events, posts, timetableEntries, users, type CalendarPrefs } from "@/db/schema";
import { IcsError, parseIcsTimetable } from "@/lib/ics-import";
import { ICS_MAX_BYTES, TIMETABLE_LABEL_MAX, TIMETABLE_MAX_ENTRIES } from "@/lib/rules";
import { parseTime } from "@/lib/schedule";
import type { Actor } from "../actor-types";
import { AppError, NotFoundError } from "../errors";
import { assertClean } from "../profanity";
import { enforce, LIMITS } from "../rate-limit";
import { publicCondition } from "./posts";

// A member's weekly timetable, which events they want on their schedule, and the events
// that match. Labels and locations are private to the member: groups only see busy times.

async function write(actor: Actor) {
  await enforce("write", actor.id, LIMITS.writePerUser.limit, LIMITS.writePerUser.window);
}

export async function myTimetable(actor: Actor) {
  return db.select().from(timetableEntries).where(eq(timetableEntries.userId, actor.id)).orderBy(asc(timetableEntries.day), asc(timetableEntries.startMin));
}

export const slotSchema = z
  .object({
    day: z.coerce.number().int().min(0).max(6),
    start: z.string(),
    end: z.string(),
    label: z.string().trim().min(1, "Give it a name, like the class code.").max(TIMETABLE_LABEL_MAX),
    location: z.string().trim().max(TIMETABLE_LABEL_MAX).default(""),
  })
  .transform((v, ctx) => {
    const startMin = parseTime(v.start);
    const endMin = parseTime(v.end);
    if (startMin === null || endMin === null) {
      ctx.addIssue({ code: "custom", message: "Enter the start and end times." });
      return z.NEVER;
    }
    if (endMin <= startMin) {
      ctx.addIssue({ code: "custom", message: "The end time must be after the start time." });
      return z.NEVER;
    }
    return { day: v.day, startMin, endMin, label: v.label, location: v.location };
  });

async function countEntries(userId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(timetableEntries).where(eq(timetableEntries.userId, userId));
  return r?.n ?? 0;
}

export async function addTimetableSlot(actor: Actor, raw: z.input<typeof slotSchema>) {
  const slot = slotSchema.parse(raw);
  await write(actor);
  await assertClean(slot.label, slot.location);
  if ((await countEntries(actor.id)) >= TIMETABLE_MAX_ENTRIES) throw new AppError(`A timetable can have at most ${TIMETABLE_MAX_ENTRIES} slots.`);
  await db.insert(timetableEntries).values({ userId: actor.id, ...slot });
}

export async function removeTimetableSlot(actor: Actor, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundError();
  await db.delete(timetableEntries).where(and(eq(timetableEntries.id, id), eq(timetableEntries.userId, actor.id)));
}

export async function clearTimetable(actor: Actor) {
  await db.delete(timetableEntries).where(eq(timetableEntries.userId, actor.id));
}

/** Reads an .ics file into the timetable. The file itself is never stored. */
export async function importTimetable(actor: Actor, bytes: Buffer, replace: boolean): Promise<number> {
  if (bytes.length === 0) throw new AppError("Choose a calendar file first.");
  if (bytes.length > ICS_MAX_BYTES) throw new AppError("That file is too big. Calendar files are usually much smaller than 1 MB.");
  await write(actor);
  let slots;
  try {
    slots = parseIcsTimetable(bytes.toString("utf8"));
  } catch (err) {
    if (err instanceof IcsError) throw new AppError(err.message);
    throw new AppError("We couldn't read that calendar file.");
  }
  if (slots.length === 0) throw new AppError("We didn't find any classes with a start and end time in that file.");
  const existing = replace ? 0 : await countEntries(actor.id);
  if (existing + slots.length > TIMETABLE_MAX_ENTRIES) {
    throw new AppError(`That file has ${slots.length} weekly slots, and a timetable can have at most ${TIMETABLE_MAX_ENTRIES}. Export just this semester's classes and try again.`);
  }
  // Class names from a calendar are private to the member, but still kept clean.
  await assertClean(...slots.map((s) => s.label));
  await db.transaction(async (tx) => {
    if (replace) await tx.delete(timetableEntries).where(eq(timetableEntries.userId, actor.id));
    await tx.insert(timetableEntries).values(slots.map((s) => ({ userId: actor.id, ...s })));
  });
  return slots.length;
}

// ---------------------------------------------------------------------------
// Which events show on the schedule
// ---------------------------------------------------------------------------
export function normalisePrefs(p: CalendarPrefs | null | undefined): Required<CalendarPrefs> {
  return {
    clubs: p?.clubs ?? "following",
    clubIds: p?.clubIds ?? [],
    authorIds: p?.authorIds ?? [],
    roles: p?.roles ?? [],
  };
}

export async function getCalendarPrefs(actor: Actor) {
  const [u] = await db.select({ prefs: users.calendarPrefs }).from(users).where(eq(users.id, actor.id)).limit(1);
  const prefs = normalisePrefs(u?.prefs);
  const people = prefs.authorIds.length
    ? await db.select({ id: users.id, username: users.username }).from(users).where(and(inArray(users.id, prefs.authorIds), eq(users.status, "active")))
    : [];
  return { ...prefs, people: people.filter((p): p is { id: string; username: string } => !!p.username) };
}

export const prefsSchema = z.object({
  clubs: z.enum(["none", "following", "all", "chosen"]),
  clubIds: z.array(z.string().uuid()).max(200).default([]),
  usernames: z.array(z.string().trim().toLowerCase().max(30)).max(30).default([]),
  roles: z.array(z.enum(["teacher", "student", "other"])).default([]),
});

export async function saveCalendarPrefs(actor: Actor, raw: z.input<typeof prefsSchema>): Promise<{ unknown: string[] }> {
  const input = prefsSchema.parse(raw);
  const names = [...new Set(input.usernames.map((u) => u.replace(/^@/, "")).filter(Boolean))];
  const found = names.length
    ? await db.select({ id: users.id, username: users.username }).from(users).where(and(inArray(users.username, names), eq(users.status, "active")))
    : [];
  const known = new Set(found.map((f) => f.username));
  const prefs: CalendarPrefs = {
    clubs: input.clubs,
    clubIds: input.clubs === "chosen" ? input.clubIds : [],
    authorIds: found.map((f) => f.id),
    roles: input.roles,
  };
  await db.update(users).set({ calendarPrefs: prefs }).where(eq(users.id, actor.id));
  return { unknown: names.filter((n) => !known.has(n)) };
}

export interface ScheduleEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  clubName: string | null;
  going: boolean;
}

/** Approved events between two instants that match the member's choices, plus any they RSVP'd to. */
export async function eventsForSchedule(actor: Actor, from: Date, to: Date): Promise<ScheduleEvent[]> {
  const [u] = await db.select({ prefs: users.calendarPrefs }).from(users).where(eq(users.id, actor.id)).limit(1);
  const p = normalisePrefs(u?.prefs);
  const rsvp = sql`exists (select 1 from ${eventRsvps} r where r.post_id = ${posts.id} and r.user_id = ${actor.id})`;
  const sources: SQL[] = [rsvp];
  if (p.clubs === "following") sources.push(sql`${posts.clubId} in (select ${clubFollows.clubId} from ${clubFollows} where ${clubFollows.userId} = ${actor.id})`);
  if (p.clubs === "all") sources.push(isNotNull(posts.clubId));
  if (p.clubs === "chosen" && p.clubIds.length) sources.push(inArray(posts.clubId, p.clubIds));
  if (p.authorIds.length) sources.push(inArray(posts.authorId, p.authorIds));
  for (const role of p.roles) {
    sources.push(role === "teacher" ? and(eq(users.roleLabel, "teacher"), eq(users.teacherVerified, true))! : eq(users.roleLabel, role));
  }
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      location: events.location,
      clubName: clubs.name,
      going: sql<boolean>`${rsvp}`,
    })
    .from(events)
    .innerJoin(posts, eq(posts.id, events.postId))
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(clubs, eq(clubs.id, posts.clubId))
    .where(and(publicCondition(), sql`${events.startsAt} < ${to}`, sql`coalesce(${events.endsAt}, ${events.startsAt}) >= ${from}`, or(...sources)))
    .orderBy(asc(events.startsAt))
    .limit(300);
  return rows;
}
