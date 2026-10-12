import { describe, expect, it } from "vitest";
import { checkPassword, isAcceptablePassword } from "@/lib/password-strength";
import { usernameProblem, slugify } from "@/lib/rules";
import { parseCsv, toCsv } from "@/lib/csv";
import { formatDate, formatTime, parseKlInput } from "@/lib/dates";

describe("usernames", () => {
  it("accepts valid usernames", () => {
    expect(usernameProblem("jane_doe99")).toBeNull();
  });
  it.each(["ab", "a".repeat(21), "Jane", "jane-doe", "jane doe", "admin", "support", "sunway", "moderator", "admin_2", "sunway_official"])(
    "rejects %s",
    (u) => expect(usernameProblem(u)).not.toBeNull(),
  );
});

describe("admin password strength", () => {
  it("rejects short and common passwords", () => {
    expect(isAcceptablePassword("short1!")).toBe(false);
    expect(isAcceptablePassword("password12345678")).toBe(false);
    expect(isAcceptablePassword("Sunway2026!!xx")).toBe(false);
    expect(isAcceptablePassword("aaaaaaaaaaaaaaaa")).toBe(false);
  });
  it("rejects passwords containing the email", () => {
    expect(isAcceptablePassword("mohammedalqadhi745-Rocks!", ["mohammedalqadhi745@gmail.com"])).toBe(false);
  });
  it("accepts long varied passwords", () => {
    expect(isAcceptablePassword("Tropical-Kettle-49-Orbit")).toBe(true);
    expect(checkPassword("Tropical-Kettle-49-Orbit").score).toBeGreaterThanOrEqual(3);
  });
});

describe("csv", () => {
  it("parses quoted fields", () => {
    expect(parseCsv('name,category\n"Club, A","Art & Music"\r\nB,Sports\n')).toEqual([
      ["name", "category"],
      ["Club, A", "Art & Music"],
      ["B", "Sports"],
    ]);
  });
  it("escapes and neutralises formulas", () => {
    expect(toCsv([{ a: '=1+1', b: 'x"y' }])).toBe('a,b\r\n\'=1+1,"x""y"\r\n');
  });
});

describe("dates", () => {
  it("formats in Kuala Lumpur time", () => {
    const d = new Date("2026-10-12T16:30:00Z"); // 00:30 on 13 Oct in KL
    expect(formatDate(d)).toBe("13 Oct 2026");
    expect(formatTime(d)).toBe("00:30");
  });
  it("parses datetime-local input as KL time", () => {
    expect(parseKlInput("2026-10-12T09:00")?.toISOString()).toBe("2026-10-12T01:00:00.000Z");
    expect(parseKlInput("nonsense")).toBeNull();
  });
  it("slugifies", () => {
    expect(slugify("Sunway Arabic & Middle Eastern Society")).toBe("sunway-arabic-and-middle-eastern-society");
  });
});
