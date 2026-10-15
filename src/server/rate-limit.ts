import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { hmacHex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { RateLimitError } from "./errors";

/**
 * Fixed-window rate limiting with counters stored in Neon.
 * Keys that contain personal data (IP, email) are hashed first.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; count: number }> {
  const result = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count
  `);
  const count = Number(result.rows[0]?.count ?? 0);
  return { ok: count <= limit, count };
}

export function rlKey(bucket: string, value: string): string {
  return `${bucket}:${hmacHex(env.sessionSecret, value).slice(0, 32)}`;
}

export async function enforce(bucket: string, value: string, limit: number, windowSeconds: number, message?: string) {
  const r = await hit(rlKey(bucket, value), limit, windowSeconds);
  if (!r.ok) throw new RateLimitError(message);
}

export const LIMITS = {
  codeRequestPerEmail: { limit: 5, window: 3600 },
  codeRequestPerIp: { limit: 20, window: 3600 },
  codeVerifyPerIp: { limit: 30, window: 900 },
  // Caps guesses at any one address however many IPs an attacker has.
  codeVerifyPerEmail: { limit: 10, window: 3600 },
  // "Sign in with another email" can target any address, so it gets its own, tighter caps.
  otherEmailPerIp: { limit: 5, window: 86400 },
  otherEmailPerEmail: { limit: 3, window: 3600 },
  passwordPerIp: { limit: 10, window: 900 },
  passwordPerAccount: { limit: 20, window: 3600 },
  passwordPerAccountTotal: { limit: 200, window: 3600 },
  uploadAuthPerUser: { limit: 60, window: 3600 },
  reportPerUser: { limit: 20, window: 3600 },
  searchPerUser: { limit: 120, window: 60 },
  contactPerIp: { limit: 3, window: 3600 },
  contactPerIpDay: { limit: 10, window: 86400 },
  writePerUser: { limit: 60, window: 3600 },
  votePerUser: { limit: 300, window: 3600 },
  commentPerUser: { limit: 60, window: 3600 },
  dmPerUser: { limit: 300, window: 3600 },
} as const;
