// Weekly timetables and free-time maths. Days are numbered Monday = 0 ... Sunday = 6,
// times are minutes after midnight in Kuala Lumpur time, and dates are "YYYY-MM-DD" keys.

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Free time is only looked for between these hours, and must last at least this long. */
export const FREE_FROM = 8 * 60;
export const FREE_UNTIL = 22 * 60;
export const FREE_MIN_LENGTH = 60;

export interface Interval {
  start: number;
  end: number;
}

export function formatMinutes(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "HH:MM" (24-hour) to minutes after midnight, or null. */
export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const DAY_MS = 86_400_000;

function keyToUtc(key: string): number {
  return Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
}

function utcToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDayKey(value: string | undefined | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return utcToKey(keyToUtc(value)) === value;
}

export function addDays(key: string, n: number): string {
  return utcToKey(keyToUtc(key) + n * DAY_MS);
}

/** Monday = 0 ... Sunday = 6. */
export function weekdayOf(key: string): number {
  return (new Date(keyToUtc(key)).getUTCDay() + 6) % 7;
}

/** The Monday of the week containing this date. */
export function weekStart(key: string): string {
  return addDays(key, -weekdayOf(key));
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Start of a Kuala Lumpur day as an instant (UTC+8, no daylight saving). */
export function klDayStart(key: string): Date {
  return new Date(`${key}T00:00:00+08:00`);
}

/** Minutes after midnight, Kuala Lumpur time, of an instant. */
export function klMinutes(d: Date): number {
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 8 * 60) % (24 * 60);
}

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Gaps between busy blocks within [from, until] that last at least minLength minutes. */
export function freeWindows(busy: Interval[], from = FREE_FROM, until = FREE_UNTIL, minLength = FREE_MIN_LENGTH): Interval[] {
  const out: Interval[] = [];
  let cursor = from;
  for (const b of mergeIntervals(busy)) {
    if (b.end <= cursor) continue;
    if (b.start >= until) break;
    if (b.start - cursor >= minLength) out.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (until - cursor >= minLength) out.push({ start: cursor, end: until });
  return out;
}

export function describeWindows(windows: Interval[]): string {
  if (windows.length === 1 && windows[0].start === FREE_FROM && windows[0].end === FREE_UNTIL) return "Free all day";
  if (windows.length === 0) return "No shared free time";
  return windows.map((w) => `${formatMinutes(w.start)}–${formatMinutes(w.end)}`).join(", ");
}
