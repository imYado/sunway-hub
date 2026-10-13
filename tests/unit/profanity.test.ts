import { describe, expect, it } from "vitest";
import { containsProfanity, createProfanityFilter, normaliseText } from "@/lib/profanity/filter";

const blocked: string[] = [
  // English, plain and obfuscated
  "fuck",
  "FUCK this",
  "what the f*ck",
  "fuuuuck",
  "f.u.c.k",
  "f u c k",
  "f-u-c-k you",
  "phuck",
  "fück",
  "fvck",
  "sh1t",
  "$hit happens",
  "shiiiit",
  "you are a b1tch",
  "b!tch",
  "a$$hole",
  "@sshole",
  "motherfucker",
  "fucking notes",
  "bullshit",
  "c u n t",
  "dickhead",
  "you wanker",
  "n1gger",
  // Malay
  "babi",
  "B4BI",
  "dasar pukimak",
  "kimak la",
  "sial betul",
  "bangsat",
  "anak haram",
  "anakharam",
  "puki",
  "pantat",
  // Arabic (transliterated)
  "sharmouta",
  "sharm0uta",
  "kos omak",
  "kuss",
  "ibn el kalb",
  // Chinese dialects (transliterated)
  "cibai",
  "ch1bai",
  "lan jiao",
  "kanina",
  "diu lei",
  "puk gai",
  "tamade",
  "cao ni ma",
  // Tamil (transliterated)
  "pundai",
  "thevidiya",
  "koothi",
  "punda",
];

const innocent: string[] = [
  "class",
  "Classic literature notes",
  "assess the assignment",
  "Assessment rubric for CSC1024",
  "Essex",
  "Scunthorpe United",
  "Sussex",
  "passing grade",
  "bass guitar",
  "cocktail party",
  "cockpit design",
  "Dickens novel summary",
  "shiitake mushrooms",
  "Analysis of algorithms",
  "therapist",
  "grape juice",
  "KNN classifier lab",
  "Sunni and Shia history",
  "cumulative GPA",
  "Titanic",
  "hello world",
  "Calculus II midterm revision",
  "Introduction to Psychology week 3",
  "Sunway Photography Club meetup",
  "Data Structures and Algorithms",
  "Assignment 2 hints",
  "glass",
  "harass",
  "massive",
  "Mississippi",
  "documentation",
  "potensial",
  "kepada semua",
  "tidak",
  "babies",
  "diurnal",
  "otherwise",
  "button",
  "kotex",
  "spunky",
];

describe("profanity filter", () => {
  const filter = createProfanityFilter();

  it.each(blocked)("blocks %s", (text) => {
    expect(filter.check(text)).toBe(true);
  });

  it.each(innocent)("allows %s", (text) => {
    expect(filter.check(text)).toBe(false);
  });

  it("has at least 50 cases", () => {
    expect(blocked.length + innocent.length).toBeGreaterThanOrEqual(50);
  });

  it("normalises accents, case and leetspeak", () => {
    expect(normaliseText("FÜCK")).toBe("fuck");
    expect(normaliseText("$h1t")).toBe("shit");
  });

  it("supports admin-added words and allow-list entries", () => {
    const custom = createProfanityFilter({ blocked: ["frak"], allowed: ["babi"] });
    expect(custom.check("frak you")).toBe(true);
    expect(custom.check("fr4kkk")).toBe(true);
    expect(custom.check("babi")).toBe(false);
    expect(custom.check("fuck")).toBe(true);
  });

  it("checks file names too", () => {
    expect(containsProfanity("my_fuck_notes.pdf")).toBe(true);
    expect(containsProfanity("CSC1024_week3_notes.pdf")).toBe(false);
  });

  it("does not throw on empty or unusual input", () => {
    expect(containsProfanity("")).toBe(false);
    expect(containsProfanity("🙂🙂🙂")).toBe(false);
    expect(containsProfanity("مرحبا")).toBe(false);
  });
});
