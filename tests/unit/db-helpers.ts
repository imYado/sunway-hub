import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import pg from "pg";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { Actor } from "@/server/actor-types";
import { recordConsent } from "@/server/legal";

export const hasDb = !!process.env.TEST_DATABASE_URL;

/** Drops and re-creates the test database schema, then applies all migrations. */
export async function resetDb() {
  const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle({ client: pool }), { migrationsFolder: "./drizzle" });
  await pool.end();
}

let counter = 0;

export async function makeUser(opts: { email?: string; username?: string; admin?: boolean; onboarded?: boolean } = {}): Promise<Actor> {
  counter++;
  const email = opts.admin ? process.env.ADMIN_EMAIL! : (opts.email ?? `student${counter}@imail.sunway.edu.my`);
  const username = opts.username ?? (opts.admin ? "siteadmin_owner" : `student_${counter}`);
  const [u] = await db
    .insert(users)
    .values({ email, username, displayName: `User ${counter}`, onboardedAt: opts.onboarded === false ? null : new Date() })
    .returning();
  if (opts.onboarded !== false) await recordConsent(u.id);
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    displayName: u.displayName,
    isAdmin: !!opts.admin,
    onboarded: opts.onboarded !== false,
    sessionId: "test-session",
    reauthAt: opts.admin ? new Date() : null,
    managedClubIds: [],
  };
}

export async function getUser(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  return u;
}
