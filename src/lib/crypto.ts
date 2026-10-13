import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacHex(key: string, input: string): string {
  return createHmac("sha256", key).update(input).digest("hex");
}

/** A uniformly random 6-digit code. */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** OTP hashes are SHA-256 of pepper + purpose + email + code. */
export function hashOtp(pepper: string, email: string, purpose: string, code: string): string {
  return sha256Hex(`${pepper}:${purpose}:${email}:${code}`);
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function deriveKey(secret: string, purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}:${secret}`).digest();
}

/** AES-256-GCM encryption for small secrets at rest (e.g. the TOTP secret). */
export function encryptSecret(secret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, "totp"), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function decryptSecret(secret: string, payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, "totp"), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
