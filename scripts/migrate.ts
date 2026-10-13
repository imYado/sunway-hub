// Applies versioned SQL migrations from ./drizzle. Run with: npm run db:migrate
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import pg from "pg";
import ws from "ws";
import { isNeonUrl } from "../src/db";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (isNeonUrl(url)) {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: url });
    await migrateNeon(drizzleNeon({ client: pool }), { migrationsFolder: "./drizzle" });
    await pool.end();
  } else {
    const pool = new pg.Pool({ connectionString: url });
    await migratePg(drizzlePg({ client: pool }), { migrationsFolder: "./drizzle" });
    await pool.end();
  }
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
