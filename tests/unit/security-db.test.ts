import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes, rateLimits, studyGroups } from "@/db/schema";
import { adminPasswordLogin } from "@/server/auth/login";
import { issueOtp, verifyOtp } from "@/server/auth/otp";
import { createGroup, joinGroup, removeMember } from "@/server/dal/groups";
import { hasDb, makeUser, resetDb } from "./db-helpers";

describe.skipIf(!hasDb)("security fixes", () => {
  beforeAll(async () => {
    await resetDb();
  });
  beforeEach(async () => {
    await db.delete(rateLimits);
  });

  it("parallel wrong guesses still only get 5 tries at a code", async () => {
    const email = "race@imail.sunway.edu.my";
    const code = await issueOtp(email, "login", { send: false });
    const wrong = code === "000000" ? "111111" : "000000";
    await Promise.all(Array.from({ length: 20 }, () => verifyOtp(email, "login", wrong)));
    const [row] = await db.select().from(otpCodes).where(eq(otpCodes.email, email));
    expect(row.attempts).toBe(5);
    expect(await verifyOtp(email, "login", code)).toBe(false);
  });

  it("wrong-email password attempts don't count against the admin", async () => {
    for (let i = 0; i < 25; i++) {
      await expect(adminPasswordLogin(`x${i}@example.com`, "nope", `10.7.${i}.1`)).rejects.toThrow(/incorrect/);
    }
    // The admin from their own IP is still allowed to try (fails only because no password is set).
    await expect(adminPasswordLogin(process.env.ADMIN_EMAIL!, "nope", "10.7.99.1")).rejects.toThrow(/incorrect/);
  });

  it("a removed study group member can't rejoin with the old invite code", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const id = await createGroup(owner, { name: "Secure group", description: "" });
    const [g] = await db.select({ code: studyGroups.inviteCode }).from(studyGroups).where(eq(studyGroups.id, id));
    await joinGroup(other, g.code);
    await removeMember(owner, id, other.id);
    await expect(joinGroup(other, g.code)).rejects.toThrow();
  });
});
