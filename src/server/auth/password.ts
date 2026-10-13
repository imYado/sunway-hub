import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id (the library default) with OWASP-recommended parameters.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 };

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

// A fixed hash used to keep timing similar when no admin password exists.
let dummy: string | null = null;
export async function dummyVerify(password: string) {
  dummy ??= await hashPassword("dummy-password-for-timing-only");
  await verifyPassword(dummy, password);
}
