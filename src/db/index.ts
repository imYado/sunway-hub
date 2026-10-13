import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import pg from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

/**
 * Production uses Neon's serverless driver (WebSocket pool, supports transactions)
 * with the POOLED connection string. Local development and tests can point
 * DATABASE_URL at a plain Postgres; then node-postgres is used instead.
 * Both drivers expose the same Drizzle query API.
 */
export function isNeonUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".neon.tech");
  } catch {
    return false;
  }
}

function createDb(url: string): DB {
  if (isNeonUrl(url)) {
    if (typeof WebSocket !== "undefined") {
      neonConfig.webSocketConstructor = WebSocket;
    }
    const pool = new NeonPool({ connectionString: url });
    return drizzleNeon({ client: pool, schema }) as unknown as DB;
  }
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  return drizzlePg({ client: pool, schema });
}

const globalForDb = globalThis as unknown as { __sunwayDb?: DB };

export function getDb(): DB {
  if (!globalForDb.__sunwayDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__sunwayDb = createDb(url);
  }
  return globalForDb.__sunwayDb;
}

/** Lazily-initialised database handle. */
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
