import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { rateLimits, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Actor } from "@/server/actor-types";
import { decidePost } from "@/server/dal/admin";
import { leaderboard } from "@/server/dal/leaderboard";
import { createPost, getPostDetail, listProfilePosts, searchPosts, toggleHelpful } from "@/server/dal/posts";
import { PAST_PAPER_DIRECTORIES } from "@/content/past-papers";
import { containsProfanity } from "@/lib/profanity/filter";
import { DESCRIPTION_MAX, MAX_LINKS_PER_POST, MAX_SUBJECT_TAGS, TITLE_MAX, TITLE_MIN, cleanLinkUrl } from "@/lib/rules";
import { hasDb, makeUser, resetDb } from "./db-helpers";

describe("cleanLinkUrl", () => {
  it("accepts http(s) links and adds https:// when missing", () => {
    expect(cleanLinkUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(cleanLinkUrl("  example.com/papers ")).toBe("https://example.com/papers");
  });
  it("rejects other schemes, credentials and bare words", () => {
    expect(cleanLinkUrl("javascript:alert(1)")).toBeNull();
    expect(cleanLinkUrl("data:text/html,hi")).toBeNull();
    expect(cleanLinkUrl("ftp://example.com")).toBeNull();
    expect(cleanLinkUrl("https://user:pw@example.com")).toBeNull();
    expect(cleanLinkUrl("localhost")).toBeNull();
    expect(cleanLinkUrl("")).toBeNull();
  });
});

describe("past paper directories", () => {
  it("fit the same rules as members' posts", () => {
    for (const d of PAST_PAPER_DIRECTORIES) {
      expect(d.title.length).toBeGreaterThanOrEqual(TITLE_MIN);
      expect(d.title.length).toBeLessThanOrEqual(TITLE_MAX);
      expect(d.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(d.subjects.length).toBeLessThanOrEqual(MAX_SUBJECT_TAGS);
      expect(d.links.length).toBeLessThanOrEqual(MAX_LINKS_PER_POST);
      for (const l of d.links) expect(cleanLinkUrl(l.url)).toBe(l.url);
      expect(containsProfanity([d.title, d.description, ...d.subjects, ...d.links.map((l) => l.label)].join(" "))).toBe(false);
    }
  });
});

let admin: Actor;
let alice: Actor;
let bob: Actor;

describe.skipIf(!hasDb)("link posts and anonymous posts", () => {
  beforeAll(async () => {
    await resetDb();
    admin = await makeUser({ admin: true });
    alice = await makeUser();
    bob = await makeUser();
  });
  beforeEach(async () => {
    await db.delete(rateLimits);
  });

  it("stores cleaned links and names unnamed ones after the site", async () => {
    const { id } = await createPost(alice, {
      type: "study",
      title: "Useful past paper links",
      subjects: ["Past Papers"],
      links: [{ url: "www.example.com/papers", label: "" }, { url: "https://example.org/x", label: "Board page" }],
      ownWork: true,
    });
    const post = await getPostDetail(alice, id);
    expect(post.links).toEqual([
      { url: "https://www.example.com/papers", label: "example.com" },
      { url: "https://example.org/x", label: "Board page" },
    ]);
  });

  it("refuses unsafe links", async () => {
    await expect(
      createPost(alice, { type: "study", title: "Bad link post", subjects: ["X"], links: [{ url: "javascript:alert(1)", label: "" }], ownWork: true }),
    ).rejects.toThrow(/not a valid web link/);
  });

  it("hides the author of anonymous posts from other members only", async () => {
    await db.update(users).set({ teacherVerified: true, showOnLeaderboard: true }).where(eq(users.id, alice.id));
    const { id } = await createPost(alice, { type: "study", title: "Anonymous directory", subjects: ["Past Papers"], anonymous: true, ownWork: true });
    await decidePost(admin, id, { decision: "approve" });
    await toggleHelpful(bob, id);

    const seenByBob = await getPostDetail(bob, id);
    expect(seenByBob.author).toMatchObject({ id: "", username: null, anonymous: true });
    expect(seenByBob.authorId).toBe("");
    expect((await getPostDetail(alice, id)).author).toMatchObject({ id: alice.id, anonymous: true });
    expect((await getPostDetail(admin, id)).author).toMatchObject({ id: alice.id, anonymous: true });

    const listed = (await searchPosts(bob, {})).items.find((p) => p.id === id);
    expect(listed?.author.username).toBeNull();
    expect((await searchPosts(bob, { verifiedTeacher: true })).items.map((p) => p.id)).not.toContain(id);
    expect((await listProfilePosts(bob, alice.id, "posts")).map((p) => p.id)).not.toContain(id);
    expect((await listProfilePosts(alice, alice.id, "posts")).map((p) => p.id)).toContain(id);
    expect((await leaderboard()).map((r) => r.userId)).not.toContain(alice.id);
  });

  it("does not allow anonymous club posts", async () => {
    await expect(
      createPost(alice, { type: "club", title: "Anonymous club post", clubId: crypto.randomUUID(), anonymous: true, ownWork: true }),
    ).rejects.toThrow(/can't be anonymous/);
  });
});
