import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits, users } from "@/db/schema";
import type { Actor } from "@/server/actor-types";
import { issueOtp } from "@/server/auth/otp";
import { startOtherEmailLogin, verifyOtherEmailCode } from "@/server/auth/login";
import { loadSession, actorFromSession } from "@/server/auth/session";
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

let ip = 0;
const nextIp = () => `10.9.0.${++ip}`;

describe.skipIf(!hasDb)("signing in with another email, and guests", () => {
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

  it("needs a real Sunway address to link to, and a non-Sunway address to sign in with", async () => {
    await expect(startOtherEmailLogin("someone@gmail.com", "me@gmail.com", nextIp())).rejects.toThrow(/Only Sunway/);
    await expect(startOtherEmailLogin("a@imail.sunway.edu.my", "b@imail.sunway.edu.my", nextIp())).rejects.toThrow(/Sunway address/);
    await expect(startOtherEmailLogin("a@imail.sunway.edu.my", "not-an-email", nextIp())).rejects.toThrow(/valid email/);
    // The admin account never gets a code this way.
    expect(await startOtherEmailLogin("a@imail.sunway.edu.my", process.env.ADMIN_EMAIL!, nextIp())).toEqual({ email: process.env.ADMIN_EMAIL });
    const code = await issueOtp(process.env.ADMIN_EMAIL!, "login_other", { send: false });
    await expect(verifyOtherEmailCode("a@imail.sunway.edu.my", process.env.ADMIN_EMAIL!, code, nextIp())).rejects.toThrow(/incorrect/);
  });

  it("creates an unverified account that can post but not use the Market or start messages, until the admin verifies it", async () => {
    const code = await issueOtp("outsider@gmail.com", "login_other", { send: false });
    const s = await verifyOtherEmailCode("21000001@imail.sunway.edu.my", "Outsider@Gmail.com", code, nextIp());
    const loaded = await loadSession(s.token);
    expect(loaded?.user).toMatchObject({ email: "outsider@gmail.com", sunwayVerified: false, claimedSunwayEmail: "21000001@imail.sunway.edu.my" });
    await db.update(users).set({ username: "outsider", onboardedAt: new Date() }).where(eq(users.id, loaded!.user.id));
    const me = await actorFromSession((await loadSession(s.token))!);

    const { id } = await createPost(me, { type: "discussion", title: "Hello from a personal email" });
    await decidePost(admin, id, { decision: "approve" });
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
