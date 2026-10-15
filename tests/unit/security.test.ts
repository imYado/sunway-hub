import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/ics";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/posts/1?x=2#c")).toBe("/posts/1?x=2#c");
    expect(safeNext(undefined)).toBe("/");
  });
  it("refuses anything a browser could read as another site", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "https://evil.com", "evil.com", "/%09/evil.com"]) {
      const out = safeNext(bad);
      expect(new URL(out, "https://sjstudy.example").origin).toBe("https://sjstudy.example");
    }
  });
});

describe("calendar export", () => {
  it("escapes semicolons and every kind of line break so nothing can add new calendar lines", () => {
    const ics = buildIcs({
      uid: "u1",
      title: "Talk\rURL:https://evil.example;x",
      description: "a\nb\r\nc",
      location: "Room 1",
      start: new Date("2026-01-01T00:00:00Z"),
      end: null,
      url: "https://sjstudy.example/posts/1",
    });
    const lines = ics.split("\r\n");
    expect(lines.some((l) => l.startsWith("URL:https://evil"))).toBe(false);
    expect(ics).not.toMatch(/[^\r]\r(?!\n)/);
    expect(ics).toContain(String.raw`Talk\nURL:https://evil.example\;x`);
  });
});
