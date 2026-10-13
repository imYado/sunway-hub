import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { e2eEnv } from "../../playwright.config";

export default async function globalSetup() {
  const pool = new pg.Pool({ connectionString: e2eEnv.DATABASE_URL });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await pool.end();
  const env = { ...process.env, ...e2eEnv };
  execSync("npx tsx scripts/migrate.ts", { env, stdio: "inherit" });
  execSync("npx tsx scripts/seed.ts --demo", { env, stdio: "inherit" });
  rmSync(path.join(process.cwd(), ".data", "outbox"), { recursive: true, force: true });
}
