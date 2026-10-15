// Seeds the database: legal documents (v1 drafts), Sunway clubs, default settings,
// and the past paper directory posts (once, after the admin has signed in for the first time).
// Idempotent: safe to run more than once. Run with: npm run db:seed
// Add --demo to also create a few sample subjects (development only).
// Vercel runs it with --deploy on every deploy: built-in clubs are then only added
// to an empty clubs table, so clubs the admin deletes don't come back.
import { count, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { getDb } from "../src/db";
import { clubs, legalDocuments, postSubjects, posts, siteSettings, subjects, users } from "../src/db/schema";
import { SUNWAY_CLUBS } from "../src/content/clubs-seed";
import { PAST_PAPER_DIRECTORIES } from "../src/content/past-papers";
import { normaliseEmail } from "../src/lib/email-domain";
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
  // Bring documents published before launch up to date: fill in the contact email and use the
  // site's current name. Neither changes what members agreed to, so they are not asked to
  // accept the documents again.
  for (const [from, to] of [
    ["[CONTACT EMAIL]", "hubsunway@gmail.com"],
    ["Sunway Hub", "SJ Study"],
  ]) {
    await db
      .update(legalDocuments)
      .set({ body: sql`replace(${legalDocuments.body}, ${from}, ${to})` })
      .where(sql`strpos(${legalDocuments.body}, ${from}) > 0`);
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

  await seedPastPaperDirectories(db);

  if (process.argv.includes("--demo")) {
    for (const name of ["CSC1024 Programming Principles", "MTH1114 Computer Mathematics", "PSY1013 Introduction to Psychology"]) {
      await db.insert(subjects).values({ slug: slugify(name), name }).onConflictDoNothing();
    }
    console.log("Demo subjects added.");
  }
  process.exit(0);
}

// Posted once, as anonymous approved posts by the admin account. A marker in site_settings stops
// them coming back if the admin later deletes them. Skipped until the admin account exists.
async function seedPastPaperDirectories(db: ReturnType<typeof getDb>) {
  const MARKER = "pastPaperDirectoriesSeeded";
  const [done] = await db.select().from(siteSettings).where(eq(siteSettings.key, MARKER)).limit(1);
  if (done) return;
  const adminEmail = process.env.ADMIN_EMAIL ? normaliseEmail(process.env.ADMIN_EMAIL) : "";
  const [admin] = adminEmail ? await db.select({ id: users.id }).from(users).where(eq(users.email, adminEmail)).limit(1) : [];
  if (!admin) {
    console.log("Past paper directories: waiting for the admin's first sign-in.");
    return;
  }
  await db.transaction(async (tx) => {
    const now = new Date();
    for (const d of PAST_PAPER_DIRECTORIES) {
      const subjectRows: { id: string; name: string }[] = [];
      for (const name of d.subjects) {
        const slug = slugify(name);
        await tx.insert(subjects).values({ slug, name }).onConflictDoNothing();
        const [row] = await tx.select({ id: subjects.id, name: subjects.name }).from(subjects).where(eq(subjects.slug, slug)).limit(1);
        if (row) subjectRows.push(row);
      }
      const postId = randomUUID();
      await tx.insert(posts).values({
        id: postId,
        authorId: admin.id,
        type: "study",
        title: d.title,
        description: d.description,
        subjectText: subjectRows.map((s) => s.name).join(" "),
        links: d.links,
        anonymous: true,
        status: "approved",
        decidedAt: now,
        decidedBy: admin.id,
        ownWorkConfirmedAt: now,
      });
      if (subjectRows.length) await tx.insert(postSubjects).values(subjectRows.map((s) => ({ postId, subjectId: s.id })));
    }
    await tx.insert(siteSettings).values({ key: MARKER, value: true });
  });
  console.log(`Past paper directories: ${PAST_PAPER_DIRECTORIES.length} posts added.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
