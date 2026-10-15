import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { rateLimits, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Actor } from "@/server/actor-types";
import { GUEST_ACTOR } from "@/server/actor";
import {
  friendCount,
  friendState,
  incomingFriendRequestCount,
  listFriendRequests,
  listFriends,
  removeFriend,
  respondToFriendRequest,
  sendFriendRequest,
} from "@/server/dal/friends";
import { getConversation, startConversation } from "@/server/dal/messages";
import { searchUsers } from "@/server/dal/users";
import { hasDb, makeUser, resetDb } from "./db-helpers";

let ann: Actor;
let ben: Actor;
let cat: Actor;

describe.skipIf(!hasDb)("friends", () => {
  beforeAll(async () => {
    await resetDb();
    ann = await makeUser({ username: "ann_f" });
    ben = await makeUser({ username: "ben_f" });
    cat = await makeUser({ username: "cat_f" });
  });
  beforeEach(async () => {
    await db.delete(rateLimits);
  });

  it("requests are mutual: one asks, the other accepts", async () => {
    expect(await friendState(ann, ben.id)).toBe("none");
    expect(await sendFriendRequest(ann, ben.id)).toBe("outgoing");
    expect(await friendState(ben, ann.id)).toBe("incoming");
    expect(await incomingFriendRequestCount(ben)).toBe(1);
    expect((await listFriendRequests(ben)).incoming.map((f) => f.username)).toEqual(["ann_f"]);
    // Asking again changes nothing.
    expect(await sendFriendRequest(ann, ben.id)).toBe("outgoing");
    expect(await respondToFriendRequest(ben, ann.id, true)).toBe("friends");
    expect(await friendState(ann, ben.id)).toBe("friends");
    expect(await friendCount(ann.id)).toBe(1);
    expect((await listFriends(ben)).map((f) => f.username)).toEqual(["ann_f"]);
  });

  it("asking someone who already asked you accepts their request", async () => {
    await sendFriendRequest(cat, ann.id);
    expect(await sendFriendRequest(ann, cat.id)).toBe("friends");
    expect(await friendState(cat, ann.id)).toBe("friends");
  });

  it("unfriending ends it for both people; declining removes the request", async () => {
    await removeFriend(cat, ann.id);
    expect(await friendState(ann, cat.id)).toBe("none");
    expect(await friendState(cat, ann.id)).toBe("none");
    await sendFriendRequest(cat, ben.id);
    expect(await respondToFriendRequest(ben, cat.id, false)).toBe("none");
    expect(await friendState(cat, ben.id)).toBe("none");
    await expect(respondToFriendRequest(ben, cat.id, true)).rejects.toThrow(/no friend request/);
  });

  it("guests and yourself are turned away", async () => {
    await expect(sendFriendRequest(GUEST_ACTOR, ann.id)).rejects.toThrow();
    await expect(sendFriendRequest(ann, ann.id)).rejects.toThrow(/yourself/);
    expect(await friendState(ann, ann.id)).toBe("self");
  });

  it("friends message each other straight away; others start with a request", async () => {
    const { id } = await startConversation(ann, { to: "ben_f", body: "Hey Ben" });
    expect((await getConversation(ben, id)).status).toBe("accepted");
    expect((await getConversation(ben, id)).friends).toBe(true);
    const r = await startConversation(cat, { to: "ann_f", body: "Hi Ann" });
    expect((await getConversation(ann, r.id)).status).toBe("pending");
    // Becoming friends accepts the waiting message request too.
    await sendFriendRequest(ann, cat.id);
    await respondToFriendRequest(cat, ann.id, true);
    expect((await getConversation(ann, r.id)).status).toBe("accepted");
  });

  it("people are found by username only, never by name or email", async () => {
    await db.update(users).set({ displayName: "Zed Secretname" }).where(eq(users.id, ben.id));
    expect((await searchUsers(ann, "ben_f")).map((u) => u.username)).toEqual(["ben_f"]);
    expect((await searchUsers(ann, "@ben")).map((u) => u.username)).toContain("ben_f");
    expect(await searchUsers(ann, "Secretname")).toEqual([]);
    const [b] = await db.select({ email: users.email }).from(users).where(eq(users.id, ben.id));
    expect(await searchUsers(ann, b.email.split("@")[0] === "ben_f" ? "imail" : b.email)).toEqual([]);
    expect(JSON.stringify(await searchUsers(ann, "f"))).not.toContain("@imail");
  });
});
