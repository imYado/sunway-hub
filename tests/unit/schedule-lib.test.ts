import { describe, expect, it } from "vitest";
import { IcsError, parseIcsTimetable } from "@/lib/ics-import";
import { addDays, describeWindows, freeWindows, isDayKey, parseTime, weekStart, weekdayOf } from "@/lib/schedule";

const ics = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}END:VCALENDAR\r\n`;

describe("calendar file import", () => {
  it("turns weekly classes into slots in Malaysian time", () => {
    const slots = parseIcsTimetable(
      ics(
        [
          // 01:00Z Monday = 09:00 in Kuala Lumpur, repeating Mondays and Wednesdays.
          "BEGIN:VEVENT\r\nSUMMARY:CSC1024 Lecture\r\nLOCATION:LT 5\r\nDTSTART:20260112T010000Z\r\nDTEND:20260112T030000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE\r\nEND:VEVENT\r\n",
          // Local time with a time zone, and a long summary folded over two lines.
          "BEGIN:VEVENT\r\nSUMMARY:MTH1114 Tutorial\r\n  group B\r\nDTSTART;TZID=Asia/Kuala_Lumpur:20260116T140000\r\nDURATION:PT1H30M\r\nEND:VEVENT\r\n",
        ].join(""),
      ),
    );
    expect(slots).toEqual([
      { day: 0, startMin: 540, endMin: 660, label: "CSC1024 Lecture", location: "LT 5" },
      { day: 2, startMin: 540, endMin: 660, label: "CSC1024 Lecture", location: "LT 5" },
      { day: 4, startMin: 840, endMin: 930, label: "MTH1114 Tutorial group B", location: "" },
    ]);
  });

  it("collapses repeated one-off classes and skips all-day and cancelled events", () => {
    const week = (d: string) => `BEGIN:VEVENT\r\nSUMMARY:Lab\r\nDTSTART:${d}T060000Z\r\nDTEND:${d}T080000Z\r\nEND:VEVENT\r\n`;
    const slots = parseIcsTimetable(
      ics(
        week("20260113") +
          week("20260120") +
          week("20260127") +
          "BEGIN:VEVENT\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20260201\r\nEND:VEVENT\r\n" +
          "BEGIN:VEVENT\r\nSUMMARY:Gone\r\nSTATUS:CANCELLED\r\nDTSTART:20260114T060000Z\r\nDTEND:20260114T070000Z\r\nEND:VEVENT\r\n",
      ),
    );
    expect(slots).toEqual([{ day: 1, startMin: 840, endMin: 960, label: "Lab", location: "" }]);
  });

  it("converts other time zones", () => {
    // 09:00 in London in January is 17:00 in Kuala Lumpur.
    const [s] = parseIcsTimetable(ics("BEGIN:VEVENT\r\nSUMMARY:Call\r\nDTSTART;TZID=Europe/London:20260112T090000\r\nDTEND;TZID=Europe/London:20260112T100000\r\nEND:VEVENT\r\n"));
    expect(s).toMatchObject({ day: 0, startMin: 17 * 60, endMin: 18 * 60 });
  });

  it("rejects files that aren't calendars", () => {
    expect(() => parseIcsTimetable("hello")).toThrow(IcsError);
  });
});

describe("free time", () => {
  it("finds gaps of at least an hour between 08:00 and 22:00", () => {
    const busy = [
      { start: 9 * 60, end: 11 * 60 },
      { start: 10 * 60, end: 12 * 60 }, // overlaps
      { start: 12 * 60 + 30, end: 14 * 60 }, // leaves a 30 minute gap, too short
      { start: 20 * 60, end: 23 * 60 },
    ];
    expect(freeWindows(busy)).toEqual([
      { start: 8 * 60, end: 9 * 60 },
      { start: 14 * 60, end: 20 * 60 },
    ]);
    expect(describeWindows(freeWindows(busy))).toBe("08:00–09:00, 14:00–20:00");
    expect(describeWindows(freeWindows([]))).toBe("Free all day");
    expect(describeWindows(freeWindows([{ start: 0, end: 24 * 60 }]))).toBe("No shared free time");
  });

  it("works out weeks and times", () => {
    expect(weekStart("2026-10-14")).toBe("2026-10-12");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekdayOf("2026-10-18")).toBe(6);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(parseTime("9:05")).toBe(545);
    expect(parseTime("24:00")).toBeNull();
  });
});
