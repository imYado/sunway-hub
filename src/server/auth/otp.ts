import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { otpCodes } from "@/db/schema";
import { generateOtp, hashOtp, safeEqualHex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { sendEmail } from "../email";

export type OtpPurpose = "login" | "admin_setup" | "admin_reset" | "delete_account";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

const SUBJECTS: Record<OtpPurpose, string> = {
  login: "Your Sunway Hub sign-in code",
  admin_setup: "Your Sunway Hub admin setup code",
  admin_reset: "Your Sunway Hub password reset code",
  delete_account: "Confirm deleting your Sunway Hub account",
};

/** Issues a new code (invalidating older ones for the same email + purpose) and emails it. */
export async function issueOtp(email: string, purpose: OtpPurpose, opts: { send?: boolean } = {}): Promise<string> {
  const code = generateOtp();
  await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.email, email), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)));
  await db.insert(otpCodes).values({
    email,
    purpose,
    codeHash: hashOtp(env.otpPepper, email, purpose, code),
    expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
  });
  if (opts.send !== false) {
    await sendEmail({
      to: email,
      subject: SUBJECTS[purpose],
      text: `Your code is ${code}\n\nIt expires in ${OTP_TTL_MINUTES} minutes and can be used once. If you did not request this, you can ignore this email.`,
    });
  }
  return code;
}

/** Single-use, expiring, attempt-limited verification. */
export async function verifyOtp(email: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!row) return false;
  if (row.expiresAt.getTime() <= Date.now() || row.attempts >= OTP_MAX_ATTEMPTS) return false;
  const ok = safeEqualHex(row.codeHash, hashOtp(env.otpPepper, email, purpose, code));
  if (!ok) {
    await db.update(otpCodes).set({ attempts: row.attempts + 1 }).where(eq(otpCodes.id, row.id));
    return false;
  }
  // Consume atomically so a code can never be used twice.
  const consumed = await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt)))
    .returning({ id: otpCodes.id });
  return consumed.length === 1;
}
