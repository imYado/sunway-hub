import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits, users } from "@/db/schema";
import type { Actor } from "@/server/actor-types";
import { decidePost, searchUsers, setSunwayVerified } from "@/server/dal/admin";
import { startConversation } from "@/server/dal/messages";
import { createPost, getPostDetail, listFeed } from "@/server/dal/posts";
import { getProfile } from "@/server/dal/users";
import { hasDb, makeUser, resetDb } from "./db-helpers";

const GUEST = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "",
  username: null,
  displayName: null,
  isAdmin: false,
  onboarded: true,
  sessionId: "",
  reauthAt: null,
  managedClubIds: [],
  guest: true,
} as Actor;


describe.skipIf(!hasDb)("unverified accounts and guests", () => {
  let admin: Actor;
  let member: Actor;
  beforeAll(async () => {
    await resetDb();
    admin = await makeUser({ admin: true });
    member = await makeUser();
  });
  beforeEach(async () => {
    await db.delete(rateLimits);
  });

  it("an unverified account (from the old other-email sign-in) shows a badge and can't use the Market or start messages until verified", async () => {
    const me = await makeUser({ email: "outsider@gmail.com", username: "outsider" });
    await db.update(users).set({ sunwayVerified: false, claimedSunwayEmail: "21000001@imail.sunway.edu.my" }).where(eq(users.id, me.id));

    const { id } = await createPost(me, { type: "discussion", title: "Hello from a personal email" });
    expect((await getPostDetail(member, id)).author.notSunway).toBe(true);
    expect((await getProfile(member, "outsider")).notSunway).toBe(true);
    await expect(createPost(me, { type: "market", marketKind: "sell", title: "Selling a lamp" })).rejects.toThrow(/isn't verified/);
    await expect(startConversation(me, { to: member.username!, body: "hi" })).rejects.toThrow(/isn't verified/);

    expect((await searchUsers(admin, "21000001@imail")).map((u) => u.id)).toContain(me.id);
    await setSunwayVerified(admin, me.id);
    expect((await getPostDetail(member, id)).author.notSunway).toBe(false);
    await createPost(me, { type: "market", marketKind: "sell", title: "Selling a lamp" });
    await startConversation(me, { to: member.username!, body: "hi" });
  });

  it("guests can read approved posts but never see private emails or get interaction controls", async () => {
    await db.update(users).set({ emailPublic: true }).where(eq(users.id, member.id));
    const { id } = await createPost(member, { type: "discussion", title: "Visible to guests" });
    await decidePost(admin, id, { decision: "approve" });
    expect((await listFeed(GUEST)).items.map((p) => p.id)).toContain(id);
    const detail = await getPostDetail(GUEST, id);
    expect(detail.viewer.canInteract).toBe(false);
    expect((await getProfile(GUEST, member.username!)).email).toBeNull();
    expect((await getProfile(admin, member.username!)).email).toBe(member.email);
  });
});
