// Seeds the database: legal documents (v1 drafts), Sunway clubs, default settings.
// Idempotent: safe to run more than once. Run with: npm run db:seed
// Add --demo to also create a few sample subjects (development only).
// Vercel runs it with --deploy on every deploy: built-in clubs are then only added
// to an empty clubs table, so clubs the admin deletes don't come back.
import { count, eq } from "drizzle-orm";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { getDb } from "../src/db";
import { clubs, legalDocuments, siteSettings, subjects } from "../src/db/schema";
import { SUNWAY_CLUBS } from "../src/content/clubs-seed";
import { PRIVACY_TEMPLATE } from "../src/content/legal/privacy";
import { TERMS_TEMPLATE } from "../src/content/legal/terms";
import { slugify } from "../src/lib/rules";

async function main() {
  if (!process.env.DATABASE_URL) {
    if (process.argv.includes("--deploy")) {
      console.warn("DATABASE_URL is not set; skipping seed.");
      process.exit(0);
    }
    throw new Error("DATABASE_URL is not set");
  }
  // Node versions without a global WebSocket need one for Neon's driver.
  if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws;
  const db = getDb();
  for (const [type, body] of [
    ["terms", TERMS_TEMPLATE],
    ["privacy", PRIVACY_TEMPLATE],
  ] as const) {
    await db.insert(legalDocuments).values({ type, version: 1, body }).onConflictDoNothing();
  }
  console.log("Legal documents: version 1 present.");

  let inserted = 0;
  const [{ value: clubCount }] = await db.select({ value: count() }).from(clubs);
  const clubsToSeed = process.argv.includes("--deploy") && clubCount > 0 ? [] : SUNWAY_CLUBS;
  for (const c of clubsToSeed) {
    const slug = slugify(c.name);
    const [existing] = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.slug, slug)).limit(1);
    if (existing) continue;
    const socials: Record<string, string> = c.instagram ? { instagram: c.instagram } : {};
    await db.insert(clubs).values({ slug, name: c.name, category: c.category, socials, description: c.note ?? "", seeded: true }).onConflictDoNothing();
    inserted++;
  }
  console.log(clubsToSeed.length ? `Clubs: ${inserted} inserted, ${clubsToSeed.length - inserted} already existed.` : "Clubs: already set up, skipped.");

  await db.insert(siteSettings).values({ key: "uploadsPerDay", value: 10 }).onConflictDoNothing();
  await db.insert(siteSettings).values({ key: "userStorageMb", value: 200 }).onConflictDoNothing();
  console.log("Settings: defaults present.");

  if (process.argv.includes("--demo")) {
    for (const name of ["CSC1024 Programming Principles", "MTH1114 Computer Mathematics", "PSY1013 Introduction to Psychology"]) {
      await db.insert(subjects).values({ slug: slugify(name), name }).onConflictDoNothing();
    }
    console.log("Demo subjects added.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
