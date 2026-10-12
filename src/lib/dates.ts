// All dates are shown in Asia/Kuala_Lumpur, e.g. "12 Oct 2026" and "14:30".
export const TIMEZONE = "Asia/Kuala_Lumpur";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TIMEZONE });
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TIMEZONE });
const partsFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIMEZONE,
});

export function formatDate(d: Date | string | number): string {
  return dateFmt.format(new Date(d)).replace(/Sept/, "Sep");
}

export function formatTime(d: Date | string | number): string {
  return timeFmt.format(new Date(d));
}

export function formatDateTime(d: Date | string | number): string {
  return `${formatDate(d)}, ${formatTime(d)}`;
}

function parts(d: Date) {
  const out: Record<string, string> = {};
  for (const p of partsFmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** "YYYY-MM-DD" of a date in Kuala Lumpur time. */
export function klDayKey(d: Date = new Date()): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Value for <input type="datetime-local"> in Kuala Lumpur time. */
export function toKlInputValue(d: Date): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Parses "YYYY-MM-DDTHH:mm" as Kuala Lumpur time (UTC+8, no daylight saving). */
export function parseKlInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+08:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Year and month (1-12) of a date in Kuala Lumpur time. */
export function klYearMonth(d: Date): { year: number; month: number } {
  const p = parts(d);
  return { year: Number(p.year), month: Number(p.month) };
}

export function timeAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return formatDate(d);
}
