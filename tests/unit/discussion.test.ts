import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clubs, comments, posts, rateLimits, storedFiles } from "@/db/schema";
import type { Actor } from "@/server/actor-types";
import { decidePost } from "@/server/dal/admin";
import { createComment, deleteComment, editComment, listComments, voteComment } from "@/server/dal/comments";
import { createPost, editPost, getFileForViewer, getPostDetail, searchPosts, setPostHidden } from "@/server/dal/posts";
import { createReport } from "@/server/dal/reports";
import { storage } from "@/server/storage";
import { hasDb, makeUser, resetDb } from "./db-helpers";
import { docxLikeBytes, pdfBytes, pngBytes } from "./fixtures";

let admin: Actor;
let alice: Actor;
let bob: Actor;
let carol: Actor;
let dave: Actor;

async function quarantine(actor: Actor, name: string, data: Buffer) {
  const pathname = `quarantine/${actor.id}/${Date.now()}-${Math.random()}-${name}`;
  await storage().put(pathname, data, "application/octet-stream");
  return { pathname, name };
}

async function approvedPost(actor: Actor, title: string, extra: Partial<Parameters<typeof createPost>[1]> = {}) {
  const { id } = await createPost(actor, { type: "discussion", title, description: "Original text.", ...extra });
  await decidePost(admin, id, { decision: "approve" });
  return id;
}

describe.skipIf(!hasDb)("discussions, editing, comments and votes", () => {
  beforeAll(async () => {
    await resetDb();
    admin = await makeUser({ admin: true });
    alice = await makeUser();
    bob = await makeUser();
    carol = await makeUser();
    dave = await makeUser();
  });
  beforeEach(async () => {
    await db.delete(rateLimits);
  });

  it("any member can post a discussion without tags, and it shows on the home feed", async () => {
    const id = await approvedPost(alice, "Best food near campus?");
    const feed = await searchPosts(bob, { sort: "hot" });
    expect(feed.items.find((p) => p.id === id)?.type).toBe("discussion");
    expect((await searchPosts(bob, { type: "discussion" })).items.map((p) => p.id)).toContain(id);
    expect((await searchPosts(bob, { type: "event" })).items.map((p) => p.id)).not.toContain(id);
  });

  it("anyone can tag a club, but only managers can post as the club", async () => {
    const [club] = await db.insert(clubs).values({ slug: "chess-club", name: "Chess Club", category: "General Interest" }).returning();
    const { id } = await createPost(bob, { type: "discussion", title: "Chess meetup this week?", clubId: club.id });
    expect((await getPostDetail(bob, id)).club?.slug).toBe("chess-club");
    await expect(createPost(bob, { type: "club", title: "Official chess news", clubId: club.id })).rejects.toThrow(/managers/);
  });

  it("only the poster can edit; the admin can hide but not edit", async () => {
    const id = await approvedPost(alice, "Editable discussion post");
    await expect(editPost(bob, id, { title: "Hijacked by bob" })).rejects.toThrow(/own posts/);
    await expect(editPost(admin, id, { title: "Changed by admin" })).rejects.toThrow(/own posts/);
    await editPost(alice, id, {
      title: "Edited discussion post",
      description: "New text.",
      subjects: ["Food", "Campus"],
      links: [{ url: "https://example.com", label: "" }],
    });
    const p = await getPostDetail(bob, id);
    expect(p).toMatchObject({ title: "Edited discussion post", description: "New text.", status: "approved" });
    expect(p.subjects.map((s) => s.name).sort()).toEqual(["Campus", "Food"]);
    expect(p.editedAt).not.toBeNull();

    await expect(setPostHidden(bob, id, true)).rejects.toThrow(/permission/);
    await setPostHidden(admin, id, true);
    await expect(getPostDetail(bob, id)).rejects.toThrow(/could not find/);
    await setPostHidden(admin, id, false);
    expect((await getPostDetail(bob, id)).hiddenByReports).toBe(false);
  });

  it("editing a post with requested changes sends it back for approval, and files can be swapped", async () => {
    const { id } = await createPost(alice, {
      type: "study",
      title: "Notes needing changes",
      subjects: ["CSC1024"],
      files: [await quarantine(alice, "a.pdf", pdfBytes())],
    });
    await decidePost(admin, id, { decision: "changes", reason: "Add the week number" });
    const before = await getPostDetail(alice, id);
    await editPost(alice, id, {
      title: "Week 3 notes needing changes",
      subjects: ["CSC1024"],
      keepFileIds: [],
      files: [await quarantine(alice, "b.png", await pngBytes())],
    });
    const after = await getPostDetail(alice, id);
    expect(after.status).toBe("pending");
    expect(after.files.map((f) => f.name)).toEqual(["b.png"]);
    const [old] = await db.select().from(storedFiles).where(eq(storedFiles.id, before.files[0].id));
    expect(old.deletedAt).not.toBeNull();
  });

  it("threaded comments, edits, votes and deletes", async () => {
    const id = await approvedPost(alice, "Discussion with comments");
    const pending = await createPost(alice, { type: "discussion", title: "Rejected post" });
    await decidePost(admin, pending.id, { decision: "reject", reason: "Off topic" });
    await expect(createComment(bob, { postId: pending.id, body: "Too early" })).rejects.toThrow(/could not find/);

    const top = await createComment(bob, { postId: id, body: "First!" });
    const reply = await createComment(carol, { postId: id, parentId: top.id, body: "A reply" });
    await expect(createComment(bob, { postId: id, body: "What the fuck" })).rejects.toThrow(/inappropriate/);
    await expect(editComment(carol, top.id, "Not mine")).rejects.toThrow(/own comments/);
    await expect(editComment(admin, top.id, "Admin edit")).rejects.toThrow(/own comments/);
    await editComment(bob, top.id, "First, edited");

    await expect(voteComment(bob, top.id, 1)).rejects.toThrow(/own comment/);
    expect(await voteComment(carol, top.id, 1)).toBe(1);
    expect(await voteComment(dave, top.id, -1)).toBe(0);

    let list = await listComments(dave, id);
    expect(list.map((c) => c.body)).toEqual(["First, edited", "A reply"]);
    expect(list[1].parentId).toBe(top.id);
    expect((await getPostDetail(dave, id)).commentCount).toBe(2);

    await expect(deleteComment(dave, top.id)).rejects.toThrow(/permission/);
    await expect(deleteComment(admin, top.id)).rejects.toThrow(/reason/);
    await deleteComment(bob, top.id);
    list = await listComments(dave, id);
    // The deleted comment stays as a placeholder because it has a reply.
    expect(list.find((c) => c.id === top.id)).toMatchObject({ deleted: true, body: "" });
    await deleteComment(admin, reply.id, "Off topic");
    expect(await listComments(dave, id)).toEqual([]);
    expect((await getPostDetail(dave, id)).commentCount).toBe(0);
  });

  it("comment attachments: images and PDFs only, served like the comment", async () => {
    const id = await approvedPost(alice, "Post with attachment comments");
    await expect(
      createComment(bob, { postId: id, body: "Word file", files: [await quarantine(bob, "x.docx", docxLikeBytes())] }),
    ).rejects.toThrow(/not an allowed file type/);
    const c = await createComment(bob, { postId: id, body: "", files: [await quarantine(bob, "sheet.pdf", pdfBytes())] });
    const [file] = await db.select().from(storedFiles).where(eq(storedFiles.commentId, c.id));
    expect(file.purpose).toBe("comment_attachment");
    expect(await getFileForViewer(carol, file.id)).not.toBeNull();
    await deleteComment(bob, c.id);
    expect(await getFileForViewer(carol, file.id)).toBeNull();
    expect(await getFileForViewer(admin, file.id)).not.toBeNull();
  });

  it("anonymous posters stay anonymous in their own comments; 3 reports hide a comment", async () => {
    const id = await approvedPost(alice, "Anonymous discussion", { anonymous: true });
    const mine = await createComment(alice, { postId: id, body: "Poster here" });
    const seen = (await listComments(bob, id)).find((c) => c.id === mine.id)!;
    expect(seen.author).toMatchObject({ id: "", anonymous: true, isPoster: true });
    expect((await listComments(admin, id)).find((c) => c.id === mine.id)!.author.id).toBe(alice.id);

    const spam = await createComment(bob, { postId: id, body: "Buy followers cheap" });
    for (const r of [carol, dave, alice]) await createReport(r, { targetType: "comment", targetId: spam.id, reason: "spam" });
    const [row] = await db.select().from(comments).where(eq(comments.id, spam.id));
    expect(row.hiddenByReports).toBe(true);
    expect((await listComments(carol, id)).find((c) => c.id === spam.id)?.body).toBe("");
    expect((await listComments(bob, id)).find((c) => c.id === spam.id)?.body).toBe("Buy followers cheap");
  });

  it("top sort orders by score", async () => {
    const low = await approvedPost(dave, "Low score discussion");
    const high = await approvedPost(dave, "High score discussion");
    await db.update(posts).set({ score: 50 }).where(eq(posts.id, high));
    await db.update(posts).set({ score: -5 }).where(eq(posts.id, low));
    const ids = (await searchPosts(bob, { sort: "top" })).items.map((p) => p.id);
    expect(ids.indexOf(high)).toBeLessThan(ids.indexOf(low));
  });
});
