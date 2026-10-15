import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, directMessages, rateLimits, storedFiles } from "@/db/schema";
import type { Actor } from "@/server/actor-types";
import { decidePost, getUserForAdmin, searchUsers } from "@/server/dal/admin";
import {
  deleteMessage,
  getConversation,
  getConversationForAdmin,
  getDmFileForViewer,
  listConversations,
  respondToRequest,
  revealIdentity,
  sendMessage,
  setBlocked,
  startConversation,
  unreadMessageCount,
} from "@/server/dal/messages";
import { createPost, listFeed, listMarket, searchPosts } from "@/server/dal/posts";
import { createReport } from "@/server/dal/reports";
import { eraseUser, identityForAdmin } from "@/server/dal/users";
import { storage } from "@/server/storage";
import { hasDb, makeUser, resetDb } from "./db-helpers";
import { pngBytes } from "./fixtures";

let admin: Actor;
let alice: Actor;
let bob: Actor;
let carol: Actor;

async function quarantine(actor: Actor, name: string, data: Buffer) {
  const pathname = `quarantine/${actor.id}/${Date.now()}-${Math.random()}-${name}`;
  await storage().put(pathname, data, "application/octet-stream");
  return { pathname, name };
}

async function approved(actor: Actor, input: Parameters<typeof createPost>[1]) {
  const { id } = await createPost(actor, input);
  await decidePost(admin, id, { decision: "approve" });
  return id;
}

describe.skipIf(!hasDb)("market and private messages", () => {
  beforeAll(async () => {
    await resetDb();
    admin = await makeUser({ admin: true });
    alice = await makeUser();
    bob = await makeUser();
    carol = await makeUser();
  });
  beforeEach(async () => {
    await db.delete(rateLimits);
  });

  it("market posts need a kind, stay off the home feed and show on the Market page", async () => {
    await expect(createPost(alice, { type: "market", title: "Selling my calculator" })).rejects.toThrow(/selling, buying/);
    const id = await approved(alice, { type: "market", marketKind: "sell", title: "Selling my calculator", anonymous: true });
    expect((await listFeed(bob)).items.map((p) => p.id)).not.toContain(id);
    expect((await listFeed(bob, { type: "market" })).items.map((p) => p.id)).not.toContain(id);
    const market = await listMarket(bob);
    expect(market.items.find((p) => p.id === id)?.marketKind).toBe("sell");
    expect(market.items.find((p) => p.id === id)?.author.anonymous).toBe(true);
    expect((await listMarket(bob, { kind: "swap" })).items.map((p) => p.id)).not.toContain(id);
    // Search still finds it.
    expect((await searchPosts(bob, { q: "calculator" })).items.map((p) => p.id)).toContain(id);
  });

  it("a request must be accepted before anything else can be sent, and text is encrypted at rest", async () => {
    const { id } = await startConversation(bob, { to: alice.username!, body: "Hi Alice, is the book still available?" });
    await expect(sendMessage(bob, id, { body: "Hello?" })).rejects.toThrow(/once they accept/);
    await expect(sendMessage(alice, id, { body: "Hi" })).rejects.toThrow(/Accept the request/);
    expect((await listConversations(alice)).requests.map((c) => c.id)).toContain(id);
    expect(await unreadMessageCount(alice)).toBeGreaterThan(0);

    const [raw] = await db.select().from(directMessages).where(eq(directMessages.conversationId, id));
    expect(raw.bodyEnc).not.toContain("Alice");

    await respondToRequest(alice, id, "accept");
    await sendMessage(alice, id, { body: "Yes it is!" });
    const view = await getConversation(bob, id);
    expect(view.messages.map((m) => m.body)).toEqual(["Hi Alice, is the book still available?", "Yes it is!"]);
    expect(view.other.username).toBe(alice.username);
    // Other members (and the admin, without a report) can't open it.
    await expect(getConversation(carol, id)).rejects.toThrow();
    await expect(getConversation(admin, id)).rejects.toThrow();
    await expect(getConversationForAdmin(admin, id)).rejects.toThrow(/reported/);
  });

  it("messaging an anonymous poster never reveals them until they choose to", async () => {
    const postId = await approved(alice, { type: "market", marketKind: "borrow", title: "Can lend a lab coat", anonymous: true });
    const { id } = await startConversation(carol, { postId, body: "Could I borrow it on Friday?" });
    let view = await getConversation(carol, id);
    expect(view.other).toEqual({ id: null, username: null, name: "Anonymous poster", anonymous: true, deleted: false });
    expect(JSON.stringify(view)).not.toContain(alice.id);
    expect(JSON.stringify(await listConversations(carol))).not.toContain(alice.id);
    // The poster sees who is asking.
    const mine = await getConversation(alice, id);
    expect(mine.other.username).toBe(carol.username);
    expect(mine.iAmHidden).toBe(true);

    await respondToRequest(alice, id, "accept");
    await sendMessage(alice, id, { body: "Sure" });
    view = await getConversation(carol, id);
    expect(view.other.anonymous).toBe(true);
    expect(JSON.stringify(view)).not.toContain(alice.id);

    await revealIdentity(alice, id);
    view = await getConversation(carol, id);
    expect(view.other.username).toBe(alice.username);
  });

  it("the anonymous conversation is separate from a named one with the same person", async () => {
    const postId = await approved(alice, { type: "discussion", title: "Anonymous question about exams", anonymous: true });
    const { id: named } = await startConversation(carol, { to: alice.username!, body: "Hi from Carol" });
    const { id: anon } = await startConversation(carol, { postId, body: "About your post" });
    expect(named).not.toBe(anon);
    const [row] = await db.select().from(conversations).where(eq(conversations.id, anon));
    expect(row.recipientAnonymous).toBe(true);
  });

  it("nobody can message themselves, and declined requests can't be repeated straight away", async () => {
    await expect(startConversation(alice, { to: alice.username!, body: "me" })).rejects.toThrow(/yourself/);
    const postId = await approved(alice, { type: "discussion", title: "My own anonymous post", anonymous: true });
    await expect(startConversation(alice, { postId, body: "me" })).rejects.toThrow(/own post/);

    const dave = await makeUser();
    const { id } = await startConversation(dave, { to: bob.username!, body: "Hey Bob" });
    await respondToRequest(bob, id, "decline");
    expect((await listConversations(bob)).requests.map((c) => c.id)).not.toContain(id);
    await expect(getConversation(bob, id)).rejects.toThrow();
    await expect(startConversation(dave, { to: bob.username!, body: "Again" })).rejects.toThrow(/declined/);
  });

  it("blocking stops messages until the blocker unblocks", async () => {
    const erin = await makeUser();
    const { id } = await startConversation(erin, { to: carol.username!, body: "Hello Carol" });
    await respondToRequest(carol, id, "accept");
    await setBlocked(carol, id, true);
    await expect(sendMessage(erin, id, { body: "?" })).rejects.toThrow(/closed/);
    await expect(startConversation(erin, { to: carol.username!, body: "?" })).rejects.toThrow(/can't message/);
    await expect(setBlocked(erin, id, false)).rejects.toThrow(/Only the person/);
    await setBlocked(carol, id, false);
    await sendMessage(erin, id, { body: "Thanks" });
  });

  it("images are encrypted in storage and only the two people can load them", async () => {
    const frank = await makeUser();
    const { id } = await startConversation(frank, { to: bob.username!, body: "Photo of the item" });
    await respondToRequest(bob, id, "accept");
    const png = await pngBytes();
    await sendMessage(frank, id, { body: "", files: [await quarantine(frank, "item.png", png)] });
    const [file] = await db.select().from(storedFiles).where(eq(storedFiles.purpose, "dm_image"));
    expect(file.encrypted).toBe(true);
    const stored = await storage().readAll(file.storagePath, 10_000_000);
    expect(stored!.subarray(1, 4).toString()).not.toBe("PNG");
    expect(await getDmFileForViewer(bob, file.id)).not.toBeNull();
    expect(await getDmFileForViewer(carol, file.id)).toBeNull();
    expect(await getDmFileForViewer(admin, file.id)).toBeNull();
    // PDFs and other files are refused.
    await expect(sendMessage(frank, id, { files: [await quarantine(frank, "notes.pdf", Buffer.from("%PDF-1.4\n%%EOF"))] })).rejects.toThrow();
  });

  it("reports let the admin read that conversation, and only participants can report", async () => {
    const gina = await makeUser();
    const { id } = await startConversation(gina, { to: alice.username!, body: "Something rude" });
    const [msg] = await db.select().from(directMessages).where(eq(directMessages.conversationId, id));
    await expect(createReport(carol, { targetType: "message", targetId: msg.id, reason: "harassment" })).rejects.toThrow();
    await expect(createReport(gina, { targetType: "message", targetId: msg.id, reason: "harassment" })).rejects.toThrow(/own message/);
    // Unsending doesn't hide it from a report.
    await deleteMessage(gina, msg.id);
    await createReport(alice, { targetType: "message", targetId: msg.id, reason: "harassment" });
    const view = await getConversationForAdmin(admin, id);
    expect(view.messages[0].body).toBe("Something rude");
    expect(view.starter.email).toBe(gina.email);
    expect(view.reportedMessageIds).toContain(msg.id);
  });

  it("the admin still sees a deleted account's email, name and username", async () => {
    const hank = await makeUser();
    await eraseUser(hank.id, "anonymise_posts", hank);
    const who = await identityForAdmin(hank.id);
    expect(who).toMatchObject({ email: hank.email, username: hank.username, status: "deleted" });
    expect((await getUserForAdmin(admin, hank.id)).identity?.email).toBe(hank.email);
    expect((await searchUsers(admin, hank.email)).map((u) => u.id)).toContain(hank.id);
  });
});
