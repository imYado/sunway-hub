// Reads a calendar file (.ics, as exported by Google Calendar, Outlook, Apple Calendar or a
// university portal) into weekly timetable slots. Every timed event becomes a slot on its
// weekday in Kuala Lumpur time; repeats of the same class collapse into one slot.

import { TIMETABLE_LABEL_MAX } from "./rules";

export interface TimetableSlot {
  day: number; // Monday = 0
  startMin: number;
  endMin: number;
  label: string;
  location: string;
}

const KL_OFFSET_MIN = 8 * 60;
const RRULE_DAYS: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** Minutes a time zone is ahead of UTC at the given instant, or null if the zone is unknown. */
function zoneOffset(zone: string, utcMs: number): number | null {
  try {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const p: Record<string, number> = {};
    for (const part of f.formatToParts(new Date(utcMs))) if (part.type !== "literal") p[part.type] = Number(part.value);
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utcMs) / 60_000;
  } catch {
    return null;
  }
}

/** A DTSTART/DTEND value as an instant, or null for all-day dates and unreadable values. */
function toInstant(prop: Prop): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(prop.value.trim());
  if (!m) return null;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  if (m[7]) return wall;
  const zone = prop.params.TZID;
  // Floating times and zones we can't read (such as Outlook's Windows names) are taken as Malaysian time.
  const offset = zone ? (zoneOffset(zone, wall) ?? KL_OFFSET_MIN) : KL_OFFSET_MIN;
  return wall - offset * 60_000;
}

function durationMinutes(value: string): number | null {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(value.trim());
  if (!m) return null;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export class IcsError extends Error {}

export function parseIcsTimetable(text: string): TimetableSlot[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new IcsError("This doesn't look like a calendar (.ics) file.");
  const slots = new Map<string, TimetableSlot>();
  let ev: Prop[] | null = null;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT$/i.test(line.trim())) {
      ev = [];
      continue;
    }
    if (/^END:VEVENT$/i.test(line.trim())) {
      if (ev) for (const s of eventToSlots(ev)) slots.set(`${s.day}|${s.startMin}|${s.endMin}|${s.label.toLowerCase()}`, s);
      ev = null;
      continue;
    }
    if (ev) {
      const p = parseLine(line);
      if (p) ev.push(p);
    }
  }
  return [...slots.values()].sort((a, b) => a.day - b.day || a.startMin - b.startMin);
}

function eventToSlots(props: Prop[]): TimetableSlot[] {
  const get = (name: string) => props.find((p) => p.name === name);
  if (get("STATUS")?.value.toUpperCase() === "CANCELLED") return [];
  const dtStart = get("DTSTART");
  if (!dtStart) return [];
  const start = toInstant(dtStart);
  if (start === null) return [];
  const dtEnd = get("DTEND");
  const dur = get("DURATION");
  const end = dtEnd ? toInstant(dtEnd) : dur ? start + (durationMinutes(dur.value) ?? 0) * 60_000 : null;
  if (end === null || end <= start || end - start > 12 * 3_600_000) return [];

  const klStart = new Date(start + KL_OFFSET_MIN * 60_000);
  const startMin = klStart.getUTCHours() * 60 + klStart.getUTCMinutes();
  const endMin = startMin + Math.round((end - start) / 60_000);
  if (endMin > 24 * 60) return [];
  const label = unescapeText(get("SUMMARY")?.value ?? "").slice(0, TIMETABLE_LABEL_MAX) || "Busy";
  const location = unescapeText(get("LOCATION")?.value ?? "").slice(0, TIMETABLE_LABEL_MAX);

  let days = [(klStart.getUTCDay() + 6) % 7];
  const rrule = get("RRULE")?.value.toUpperCase() ?? "";
  if (/FREQ=WEEKLY/.test(rrule)) {
    const byDay = /BYDAY=([A-Z,0-9+-]+)/.exec(rrule)?.[1];
    if (byDay) {
      const parsed = byDay
        .split(",")
        .map((d) => RRULE_DAYS[d.replace(/^[+-]?\d+/, "")])
        .filter((d): d is number => d !== undefined);
      if (parsed.length) days = parsed;
    }
  }
  return days.map((day) => ({ day, startMin, endMin, label, location }));
}
