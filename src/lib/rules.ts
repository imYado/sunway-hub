// Shared validation rules (used on both server and client).
import { z } from "zod";

export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "root",
  "support",
  "help",
  "sunway",
  "sunwayhub",
  "sunwayuni",
  "sunwayuniversity",
  "moderator",
  "mod",
  "mods",
  "staff",
  "official",
  "system",
  "security",
  "team",
  "null",
  "undefined",
  "me",
  "settings",
  "login",
  "logout",
  "api",
  "new",
  "edit",
  "deleted",
  "deleteduser",
  "anonymous",
  "studentlife",
  "privacy",
  "terms",
  "contact",
  "owner",
]);

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
/** Two-character usernames exist, but only the admin can hand them out. */
export const SHORT_USERNAME_RE = /^[a-z0-9_]{2}$/;

export function usernameProblem(username: string, opts: { allowShort?: boolean } = {}): string | null {
  if (SHORT_USERNAME_RE.test(username)) {
    if (!opts.allowShort) return "Not allowed.";
  } else if (!USERNAME_RE.test(username)) {
    return "Usernames are 3-20 characters: lowercase letters, numbers and underscores.";
  }
  const bare = username.replace(/_/g, "");
  if (RESERVED_USERNAMES.has(username) || RESERVED_USERNAMES.has(bare) || /^(admin|sunway|mod)/.test(bare)) {
    return "That username is reserved. Please choose another.";
  }
  return null;
}

/** Members may change their username this many times in any 7 days. The admin has no limit. */
export const USERNAME_CHANGES_PER_WEEK = 2;
const WEEK_MS = 7 * 86_400_000;

/** When a member may next change their username, or null if they can now. */
export function nextUsernameChange(prevChangedAt: Date | null, now = Date.now()): Date | null {
  if (!prevChangedAt || now - prevChangedAt.getTime() >= WEEK_MS) return null;
  return new Date(prevChangedAt.getTime() + WEEK_MS);
}
export const BIO_MAX = 160;
export const DISPLAY_NAME_MAX = 60;
export const TITLE_MIN = 5;
export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 2000;
export const REPORT_NOTE_MAX = 500;
export const MAX_SUBJECT_TAGS = 3;

export const PRONOUN_OPTIONS = [
  { value: "he", label: "he" },
  { value: "she", label: "she" },
  { value: "unspecified", label: "rather not say" },
] as const;

export const ROLE_OPTIONS = [
  { value: "student", label: "Student" },
  { value: "teacher", label: "Teacher" },
  { value: "other", label: "Other" },
] as const;

export const POST_TYPES = [
  { value: "study", label: "Study Material" },
  { value: "event", label: "Event" },
  { value: "club", label: "Club Post" },
] as const;

export const REPORT_REASONS = [
  { value: "copyright", label: "Copyright" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "harassment", label: "Harassment" },
  { value: "exam_material", label: "Exam or cheating material" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
] as const;

export const CLUB_CATEGORIES = [
  "Accounting & Finance",
  "Art & Music",
  "Business",
  "Cultural",
  "General Interest",
  "Martial Art",
  "Nature",
  "Religious",
  "Sports",
  "Uniform/Affiliate",
  "Academic/Professional",
  "Student Leadership Body",
] as const;
export type ClubCategory = (typeof CLUB_CATEGORIES)[number];

export const SOCIAL_KEYS = ["instagram", "facebook", "tiktok", "linkedin", "website"] as const;

export const OWN_WORK_STATEMENT =
  "This is my own work, or I have permission to share it. It is not a lecturer's slides, a textbook, an exam paper, exam answers, or assessment material for a currently running assessment.";

/** "Jan 2026" style semester labels. */
export const SEMESTER_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (20\d{2})$/;

export function semesterOptions(now = new Date()): string[] {
  const months = ["Jan", "Apr", "Aug", "Sep"];
  const year = now.getUTCFullYear();
  const out: string[] = [];
  for (let y = year + 1; y >= year - 4; y--) for (const m of [...months].reverse()) out.push(`${m} ${y}`);
  return out;
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const titleSchema = z
  .string()
  .trim()
  .min(TITLE_MIN, `Titles need at least ${TITLE_MIN} characters.`)
  .max(TITLE_MAX, `Titles can be at most ${TITLE_MAX} characters.`);

export const emailInputSchema = z.string().trim().min(3).max(254);
export const otpSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");

export function cleanSocialHandle(value: string): string {
  return value.trim().replace(/^@/, "").slice(0, 200);
}
