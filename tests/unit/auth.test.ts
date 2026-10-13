import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminCredentials, otpCodes, rateLimits, users } from "@/db/schema";
import { issueOtp, verifyOtp } from "@/server/auth/otp";
import {
  adminPasswordLogin,
  completeAdminPassword,
  completeTotpStep,
  enableTotp,
  startLogin,
  verifyLoginCode,
} from "@/server/auth/login";
import { loadSession } from "@/server/auth/session";
import { newTotpSecret, totpCode } from "@/server/auth/totp";
import { hasDb, resetDb } from "./db-helpers";

const ADMIN = process.env.ADMIN_EMAIL!;
let ip = 0;
const nextIp = () => `10.0.0.${++ip}`;

describe.skipIf(!hasDb)("authentication", () => {
  beforeAll(async () => {
    await resetDb();
  });
  beforeEach(async () => {
    await db.delete(rateLimits);
  });

  it("rejects non-Sunway emails with neutral wording", async () => {
    expect(await startLogin("someone@gmail.com", nextIp())).toEqual({ step: "rejected" });
    expect(await startLogin("x@imail.sunway.edu.my.evil.com", nextIp())).toEqual({ step: "rejected" });
  });

  it("member sign-in: code is single use and creates an active 30-day session", async () => {
    const email = "newstudent@imail.sunway.edu.my";
    const step = await startLogin(email, nextIp());
    expect(step).toMatchObject({ step: "code", purpose: "login" });
    const code = await issueOtp(email, "login", { send: false });
    const s = await verifyLoginCode(email, "login", code, nextIp());
    expect(s.stage).toBe("active");
    const loaded = await loadSession(s.token);
    expect(loaded?.user.email).toBe(email);
    expect(loaded!.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
    await expect(verifyLoginCode(email, "login", code, nextIp())).rejects.toThrow(/incorrect or has expired/);
  });

  it("stores codes only as hashes", async () => {
    const email = "hash@imail.sunway.edu.my";
    const code = await issueOtp(email, "login", { send: false });
    const rows = await db.select().from(otpCodes).where(eq(otpCodes.email, email));
    expect(rows.every((r) => r.codeHash !== code && r.codeHash.length === 64)).toBe(true);
  });

  it("locks a code after 5 wrong attempts", async () => {
    const email = "attempts@imail.sunway.edu.my";
    const code = await issueOtp(email, "login", { send: false });
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(await verifyOtp(email, "login", wrong)).toBe(false);
    expect(await verifyOtp(email, "login", code)).toBe(false);
  });

  it("issuing a new code invalidates the old one", async () => {
    const email = "rotate@imail.sunway.edu.my";
    const first = await issueOtp(email, "login", { send: false });
    const second = await issueOtp(email, "login", { send: false });
    if (first !== second) expect(await verifyOtp(email, "login", first)).toBe(false);
    expect(await verifyOtp(email, "login", second)).toBe(true);
  });

  it("expired codes are rejected", async () => {
    const email = "expired@imail.sunway.edu.my";
    const code = await issueOtp(email, "login", { send: false });
    await db.update(otpCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(otpCodes.email, email));
    expect(await verifyOtp(email, "login", code)).toBe(false);
  });

  it("rate limits code requests to 5 per hour per email", async () => {
    const email = "spam@imail.sunway.edu.my";
    for (let i = 0; i < 5; i++) await startLogin(email, nextIp());
    await expect(startLogin(email, nextIp())).rejects.toThrow(/Too many/);
  });

  it("banned members get the same response but can never sign in", async () => {
    const email = "banned@imail.sunway.edu.my";
    await db.insert(users).values({ email, status: "banned" });
    expect(await startLogin(email, nextIp())).toMatchObject({ step: "code" });
    const code = await issueOtp(email, "login", { send: false });
    await expect(verifyLoginCode(email, "login", code, nextIp())).rejects.toThrow(/incorrect or has expired/);
  });

  it("member emails cannot use admin code purposes or passwords", async () => {
    const email = "sneaky@imail.sunway.edu.my";
    await expect(verifyLoginCode(email, "admin_setup", "123456", nextIp())).rejects.toThrow();
    await expect(adminPasswordLogin(email, "anything-long-enough", nextIp())).rejects.toThrow(/incorrect/);
  });

  it("no password can be created for a non-admin session", async () => {
    const email = "pwmember@imail.sunway.edu.my";
    const code = await issueOtp(email, "login", { send: false });
    const s = await verifyLoginCode(email, "login", code, nextIp());
    const loaded = (await loadSession(s.token))!;
    // Even if the stage were tampered with, the email check blocks it.
    await expect(completeAdminPassword({ ...loaded, stage: "needs_password" }, "Tropical-Kettle-49-Orbit")).rejects.toThrow(
      /not available/,
    );
    const creds = await db.select().from(adminCredentials);
    expect(creds.length).toBe(0);
  });

  it("admin first time: email code, then create password, then password sign-in with TOTP", async () => {
    expect(await startLogin(ADMIN.toUpperCase(), nextIp())).toMatchObject({ step: "code", purpose: "admin_setup" });
    const code = await issueOtp(ADMIN, "admin_setup", { send: false });
    const s = await verifyLoginCode(ADMIN, "admin_setup", code, nextIp());
    expect(s.stage).toBe("needs_password");
    const pending = (await loadSession(s.token))!;
    await expect(completeAdminPassword(pending, "short")).rejects.toThrow(/stronger/);
    expect(await completeAdminPassword(pending, "Tropical-Kettle-49-Orbit")).toBe("active");

    // Now the login page asks for the password.
    expect(await startLogin(ADMIN, nextIp())).toEqual({ step: "password", email: ADMIN });
    await expect(adminPasswordLogin(ADMIN, "wrong-password-123", nextIp())).rejects.toThrow(/incorrect/);
    const ok = await adminPasswordLogin(ADMIN, "Tropical-Kettle-49-Orbit", nextIp());
    expect(ok.stage).toBe("active");

    // Turn on TOTP: next password sign-in requires the authenticator code.
    const [admin] = await db.select().from(users).where(eq(users.email, ADMIN));
    const secret = newTotpSecret();
    expect(await enableTotp(admin.id, secret, totpCode(secret))).toBe(true);
    const step2 = await adminPasswordLogin(ADMIN, "Tropical-Kettle-49-Orbit", nextIp());
    expect(step2.stage).toBe("needs_totp");
    const needsTotp = (await loadSession(step2.token))!;
    await expect(completeTotpStep(needsTotp, "000000", nextIp())).rejects.toThrow();
    await completeTotpStep(needsTotp, totpCode(secret), nextIp());
    expect((await loadSession(step2.token))?.stage).toBe("active");

    // A second "first-time setup" is impossible once a password exists.
    const code2 = await issueOtp(ADMIN, "admin_setup", { send: false });
    await expect(verifyLoginCode(ADMIN, "admin_setup", code2, nextIp())).rejects.toThrow();
  });
});
