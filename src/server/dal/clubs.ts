import "server-only";
import { and, asc, count, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import {
  clubFollows,
  clubManagerRequests,
  clubManagers,
  clubs,
  storedFiles,
  subjectFollows,
  subjects,
  users,
} from "@/db/schema";
import { SUNWAY_CLUBS } from "@/content/clubs-seed";
import { parseCsv } from "@/lib/csv";
import { CLUB_CATEGORIES, SOCIAL_KEYS, cleanSocialHandle, slugify, type ClubCategory } from "@/lib/rules";
import type { Actor } from "../actor-types";
import { audit } from "../audit";
import { AppError, NotFoundError } from "../errors";
import { assertClean, getServerFilter } from "../profanity";
import { enforce, LIMITS } from "../rate-limit";
import { storage } from "../storage";
import { notify } from "./notifications";
import { assertAdmin, assertManagesClub } from "./policy";
import { listEvents, searchPosts, type PostCard } from "./posts";
import { processSquareImage, storageStatus } from "./uploads";
import { softDeleteFile } from "./users";

export type ClubRow = typeof clubs.$inferSelect;

export interface ClubCard {
  id: string;
  slug: string;
  name: string;
  category: ClubCategory;
  description: string;
  logoFileId: string | null;
  unclaimed: boolean;
  followers: number;
}

function visibleClubCondition(actor: Actor): SQL {
  return actor.isAdmin ? (isNull(clubs.deletedAt) as SQL) : (and(isNull(clubs.deletedAt), eq(clubs.hiddenByReports, false)) as SQL);
}

export async function listClubs(actor: Actor, opts: { q?: string; category?: string } = {}): Promise<ClubCard[]> {
  const conds: SQL[] = [visibleClubCondition(actor)];
  const q = opts.q?.trim().slice(0, 80);
  if (q) conds.push(or(ilike(clubs.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`), sql`${clubs.name} % ${q}`) as SQL);
  if (opts.category && (CLUB_CATEGORIES as readonly string[]).includes(opts.category)) {
    conds.push(eq(clubs.category, opts.category as ClubCategory));
  }
  const rows = await db
    .select({
      id: clubs.id,
      slug: clubs.slug,
      name: clubs.name,
      category: clubs.category,
      description: clubs.description,
      logoFileId: clubs.logoFileId,
      managers: sql<number>`(select count(*)::int from ${clubManagers} m where m.club_id = ${clubs.id})`,
      followers: sql<number>`(select count(*)::int from ${clubFollows} f where f.club_id = ${clubs.id})`,
    })
    .from(clubs)
    .where(and(...conds))
    .orderBy(asc(clubs.name));
  return rows.map((r) => ({ ...r, unclaimed: Number(r.managers) === 0, followers: Number(r.followers) }));
}

export interface ClubDetail {
  club: ClubRow;
  unclaimed: boolean;
  managers: { id: string; username: string | null; displayName: string | null }[];
  followers: number;
  following: boolean;
  isManager: boolean;
  pendingRequest: boolean;
  pendingLogo: boolean;
}

export async function getClub(actor: Actor, slug: string): Promise<ClubDetail> {
  const [club] = await db
    .select()
    .from(clubs)
    .where(and(eq(clubs.slug, slug), visibleClubCondition(actor)))
    .limit(1);
  if (!club) throw new NotFoundError();
  const managers = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(clubManagers)
    .innerJoin(users, eq(users.id, clubManagers.userId))
    .where(eq(clubManagers.clubId, club.id));
  const [f] = await db.select({ n: count() }).from(clubFollows).where(eq(clubFollows.clubId, club.id));
  const [me] = await db
    .select()
    .from(clubFollows)
    .where(and(eq(clubFollows.clubId, club.id), eq(clubFollows.userId, actor.id)))
    .limit(1);
  const [req] = await db
    .select({ id: clubManagerRequests.id })
    .from(clubManagerRequests)
    .where(and(eq(clubManagerRequests.clubId, club.id), eq(clubManagerRequests.userId, actor.id), eq(clubManagerRequests.status, "pending")))
    .limit(1);
  const isManager = actor.managedClubIds.includes(club.id);
  return {
    club,
    unclaimed: managers.length === 0,
    managers,
    followers: Number(f?.n ?? 0),
    following: !!me,
    isManager,
    pendingRequest: !!req,
    pendingLogo: !!club.pendingLogoFileId && (isManager || actor.isAdmin),
  };
}

export async function clubUpcomingEvents(actor: Actor, clubId: string) {
  return listEvents(actor, { from: new Date(), clubId, limit: 10 });
}

export async function clubRecentPosts(actor: Actor, clubId: string): Promise<PostCard[]> {
  const [club] = await db.select({ slug: clubs.slug }).from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club) return [];
  const r = await searchPosts(actor, { club: club.slug, sort: "newest" });
  return r.items.slice(0, 10);
}

export async function toggleFollowClub(actor: Actor, clubId: string): Promise<boolean> {
  const [club] = await db.select({ id: clubs.id }).from(clubs).where(and(eq(clubs.id, clubId), visibleClubCondition(actor))).limit(1);
  if (!club) throw new NotFoundError();
  const removed = await db
    .delete(clubFollows)
    .where(and(eq(clubFollows.clubId, clubId), eq(clubFollows.userId, actor.id)))
    .returning();
  if (removed.length) return false;
  await db.insert(clubFollows).values({ clubId, userId: actor.id }).onConflictDoNothing();
  return true;
}

export async function toggleFollowSubject(actor: Actor, subjectId: string): Promise<boolean> {
  const [s] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  if (!s) throw new NotFoundError();
  const removed = await db
    .delete(subjectFollows)
    .where(and(eq(subjectFollows.subjectId, subjectId), eq(subjectFollows.userId, actor.id)))
    .returning();
  if (removed.length) return false;
  await db.insert(subjectFollows).values({ subjectId, userId: actor.id }).onConflictDoNothing();
  return true;
}

export async function isFollowingSubject(actor: Actor, subjectId: string): Promise<boolean> {
  const [r] = await db
    .select()
    .from(subjectFollows)
    .where(and(eq(subjectFollows.subjectId, subjectId), eq(subjectFollows.userId, actor.id)))
    .limit(1);
  return !!r;
}

// ---------------------------------------------------------------------------
// Club managers
// ---------------------------------------------------------------------------
export const managerRequestSchema = z.object({
  clubId: z.string().uuid(),
  message: z.string().trim().min(10, "Tell the admin a little about your role in the club.").max(1000),
  proof: z.string().trim().min(3, "Add proof, for example your committee role or a link to the club's post naming you.").max(500),
});

export async function requestToManage(actor: Actor, raw: z.input<typeof managerRequestSchema>) {
  const input = managerRequestSchema.parse(raw);
  await enforce("write", actor.id, LIMITS.writePerUser.limit, LIMITS.writePerUser.window);
  await assertClean(input.message, input.proof);
  const [club] = await db.select().from(clubs).where(and(eq(clubs.id, input.clubId), isNull(clubs.deletedAt))).limit(1);
  if (!club) throw new NotFoundError();
  if (actor.managedClubIds.includes(club.id)) throw new AppError("You already manage this club.");
  const [pending] = await db
    .select({ id: clubManagerRequests.id })
    .from(clubManagerRequests)
    .where(and(eq(clubManagerRequests.clubId, club.id), eq(clubManagerRequests.userId, actor.id), eq(clubManagerRequests.status, "pending")))
    .limit(1);
  if (pending) throw new AppError("You already have a pending request for this club.");
  await db.insert(clubManagerRequests).values({ clubId: club.id, userId: actor.id, message: input.message, proof: input.proof });
}

export const clubEditSchema = z.object({
  description: z.string().trim().max(2000).default(""),
  socials: z.record(z.enum(SOCIAL_KEYS), z.string().max(200)).default({}),
});

function cleanSocials(input: Partial<Record<(typeof SOCIAL_KEYS)[number], string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SOCIAL_KEYS) {
    const v = input[key];
    if (!v) continue;
    if (key === "website") {
      try {
        const u = new URL(v.trim());
        if (u.protocol === "https:" || u.protocol === "http:") out.website = u.toString();
      } catch {
        throw new AppError("Enter a full website address starting with https://");
      }
    } else {
      const handle = cleanSocialHandle(v);
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(handle)) throw new AppError(`Enter just the ${key} handle, without a link.`);
      out[key] = handle;
    }
  }
  return out;
}

/** Club managers (and the admin) may edit description and social links. */
export async function updateClubAsManager(actor: Actor, clubId: string, raw: z.input<typeof clubEditSchema>) {
  assertManagesClub(actor, clubId);
  const input = clubEditSchema.parse(raw);
  await enforce("write", actor.id, LIMITS.writePerUser.limit, LIMITS.writePerUser.window);
  const socials = cleanSocials(input.socials);
  await assertClean(input.description, ...Object.values(socials));
  await db.update(clubs).set({ description: input.description, socials, updatedAt: new Date() }).where(eq(clubs.id, clubId));
  await audit(actor, "club.edit", { type: "club", id: clubId });
}

export async function uploadClubLogo(actor: Actor, clubId: string, bytes: Buffer, name: string): Promise<"pending" | "approved"> {
  assertManagesClub(actor, clubId);
  const status = await storageStatus();
  if (status.refuse) throw new AppError("Uploads are paused because the site's shared storage is nearly full.", 503);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club) throw new NotFoundError();
  const img = await processSquareImage(bytes);
  const fileId = randomUUID();
  const storagePath = `club-logos/${clubId}/${fileId}.webp`;
  await storage().put(storagePath, img.data, img.mime);
  const autoApprove = actor.isAdmin;
  await db.insert(storedFiles).values({
    id: fileId,
    ownerId: actor.id,
    purpose: "club_logo",
    clubId,
    storagePath,
    originalName: name.slice(0, 120) || "logo",
    contentType: img.mime,
    kind: "image",
    size: img.data.length,
    sha256: img.sha256,
    width: 512,
    height: 512,
    reviewStatus: autoApprove ? "approved" : "pending",
    reviewedAt: autoApprove ? new Date() : null,
    reviewedBy: autoApprove ? actor.id : null,
  });
  if (club.pendingLogoFileId) await softDeleteFile(club.pendingLogoFileId);
  if (autoApprove) {
    if (club.logoFileId) await softDeleteFile(club.logoFileId);
    await db.update(clubs).set({ logoFileId: fileId, pendingLogoFileId: null }).where(eq(clubs.id, clubId));
  } else {
    await db.update(clubs).set({ pendingLogoFileId: fileId }).where(eq(clubs.id, clubId));
  }
  return autoApprove ? "approved" : "pending";
}

export async function getClubLogoForViewer(actor: Actor, clubId: string, wantPending: boolean) {
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club || (club.deletedAt && !actor.isAdmin)) return null;
  const fileId = wantPending && (actor.isAdmin || actor.managedClubIds.includes(clubId)) ? club.pendingLogoFileId : club.logoFileId;
  if (!fileId) return null;
  const [f] = await db.select().from(storedFiles).where(eq(storedFiles.id, fileId)).limit(1);
  return f && !f.deletedAt ? f : null;
}

// ---------------------------------------------------------------------------
// Admin: clubs
// ---------------------------------------------------------------------------
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "club";
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const [taken] = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.slug, slug)).limit(1);
    if (!taken) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

/** Upsert by slug, so clicking twice never duplicates. Published immediately. */
export async function importSunwayClubs(actor: Actor): Promise<{ inserted: number; updated: number }> {
  assertAdmin(actor);
  let inserted = 0;
  let updated = 0;
  for (const c of SUNWAY_CLUBS) {
    const slug = slugify(c.name);
    const socials: Record<string, string> = c.instagram ? { instagram: c.instagram } : {};
    const [existing] = await db.select({ id: clubs.id, deletedAt: clubs.deletedAt }).from(clubs).where(eq(clubs.slug, slug)).limit(1);
    if (existing) {
      // Do not overwrite edits made since the last import; only restore missing basics.
      updated++;
      continue;
    }
    await db
      .insert(clubs)
      .values({ slug, name: c.name, category: c.category, socials, description: c.note ?? "", seeded: true })
      .onConflictDoNothing({ target: clubs.slug });
    inserted++;
  }
  await audit(actor, "clubs.import_sunway", {}, null, { inserted, skipped: updated });
  return { inserted, updated };
}

export const adminClubSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(CLUB_CATEGORIES),
  description: z.string().trim().max(2000).default(""),
  instagram: z.string().trim().max(100).optional().default(""),
});

export async function adminAddClub(actor: Actor, raw: z.input<typeof adminClubSchema>): Promise<string> {
  assertAdmin(actor);
  const input = adminClubSchema.parse(raw);
  await assertClean(input.name, input.description);
  const slug = await uniqueSlug(input.name);
  const socials = input.instagram ? cleanSocials({ instagram: input.instagram }) : {};
  const [row] = await db
    .insert(clubs)
    .values({ slug, name: input.name, category: input.category, description: input.description, socials })
    .returning({ id: clubs.id });
  await audit(actor, "club.create", { type: "club", id: row.id }, null, { name: input.name });
  return slug;
}

export async function adminEditClub(actor: Actor, clubId: string, raw: z.input<typeof adminClubSchema>) {
  assertAdmin(actor);
  const input = adminClubSchema.parse(raw);
  await assertClean(input.name, input.description);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  if (!club) throw new NotFoundError();
  const socials = { ...club.socials, ...(input.instagram ? cleanSocials({ instagram: input.instagram }) : {}) };
  if (!input.instagram) delete socials.instagram;
  await db
    .update(clubs)
    .set({ name: input.name, category: input.category, description: input.description, socials, updatedAt: new Date() })
    .where(eq(clubs.id, clubId));
  await audit(actor, "club.edit", { type: "club", id: clubId });
}

export async function adminDeleteClub(actor: Actor, clubId: string, reason: string) {
  assertAdmin(actor);
  if (!reason.trim()) throw new AppError("Please give a reason.");
  await db.update(clubs).set({ deletedAt: new Date(), deleteReason: reason.trim().slice(0, 500) }).where(eq(clubs.id, clubId));
  await audit(actor, "club.delete", { type: "club", id: clubId }, reason);
}

export async function adminRestoreClub(actor: Actor, clubId: string) {
  assertAdmin(actor);
  await db.update(clubs).set({ deletedAt: null, deleteReason: null }).where(eq(clubs.id, clubId));
  await audit(actor, "club.restore", { type: "club", id: clubId });
}

/** CSV columns: name, category, instagram, description. Upserts by slug. */
export async function adminImportClubsCsv(actor: Actor, text: string): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  assertAdmin(actor);
  const rows = parseCsv(text);
  if (rows.length === 0) throw new AppError("The CSV file is empty.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes("name");
  const idx = (col: string, fallback: number) => (hasHeader ? header.indexOf(col) : fallback);
  const iName = idx("name", 0);
  const iCat = idx("category", 1);
  const iIg = idx("instagram", 2);
  const iDesc = idx("description", 3);
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const f = await getServerFilter();
  for (const [n, row] of (hasHeader ? rows.slice(1) : rows).entries()) {
    const line = n + (hasHeader ? 2 : 1);
    const name = (row[iName] ?? "").trim();
    const category = (row[iCat] ?? "").trim();
    const instagram = iIg >= 0 ? cleanSocialHandle(row[iIg] ?? "") : "";
    const description = iDesc >= 0 ? (row[iDesc] ?? "").trim().slice(0, 2000) : "";
    if (!name) {
      errors.push(`Line ${line}: missing name.`);
      continue;
    }
    if (!(CLUB_CATEGORIES as readonly string[]).includes(category)) {
      errors.push(`Line ${line}: unknown category "${category}".`);
      continue;
    }
    if (f.check(name) || f.check(description)) {
      errors.push(`Line ${line}: contains blocked language.`);
      continue;
    }
    if (instagram && !/^[A-Za-z0-9._-]{1,100}$/.test(instagram)) {
      errors.push(`Line ${line}: invalid Instagram handle.`);
      continue;
    }
    const slug = slugify(name);
    const res = await db
      .insert(clubs)
      .values({ slug, name, category: category as ClubCategory, description, socials: (instagram ? { instagram } : {}) as Record<string, string>, seeded: true })
      .onConflictDoNothing({ target: clubs.slug })
      .returning({ id: clubs.id });
    if (res.length) inserted++;
    else skipped++;
  }
  await audit(actor, "clubs.import_csv", {}, null, { inserted, skipped, errors: errors.length });
  return { inserted, skipped, errors };
}

export async function listManagerRequests(actor: Actor) {
  assertAdmin(actor);
  return db
    .select({
      id: clubManagerRequests.id,
      message: clubManagerRequests.message,
      proof: clubManagerRequests.proof,
      createdAt: clubManagerRequests.createdAt,
      clubId: clubs.id,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      email: users.email,
    })
    .from(clubManagerRequests)
    .innerJoin(clubs, eq(clubs.id, clubManagerRequests.clubId))
    .innerJoin(users, eq(users.id, clubManagerRequests.userId))
    .where(eq(clubManagerRequests.status, "pending"))
    .orderBy(asc(clubManagerRequests.createdAt));
}

export async function decideManagerRequest(actor: Actor, requestId: string, approve: boolean, reason?: string) {
  assertAdmin(actor);
  const [req] = await db.select().from(clubManagerRequests).where(eq(clubManagerRequests.id, requestId)).limit(1);
  if (!req || req.status !== "pending") throw new NotFoundError();
  const [club] = await db.select().from(clubs).where(eq(clubs.id, req.clubId)).limit(1);
  await db
    .update(clubManagerRequests)
    .set({ status: approve ? "approved" : "rejected", decisionReason: reason?.trim() || null, decidedAt: new Date(), decidedBy: actor.id })
    .where(eq(clubManagerRequests.id, requestId));
  if (approve) {
    await db.insert(clubManagers).values({ clubId: req.clubId, userId: req.userId, assignedBy: actor.id }).onConflictDoNothing();
  }
  await audit(actor, approve ? "club_manager.approve" : "club_manager.reject", { type: "club", id: req.clubId }, reason ?? null, {
    userId: req.userId,
  });
  await notify([req.userId], {
    kind: "decision",
    title: approve ? `You are now a manager of ${club?.name}` : `Your request to manage ${club?.name} was not approved`,
    body: reason?.trim() ? `Note from the admin: ${reason.trim()}` : null,
    link: club ? `/clubs/${club.slug}` : null,
  });
}

export async function assignClubManager(actor: Actor, clubId: string, userId: string, assign: boolean) {
  assertAdmin(actor);
  if (assign) {
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u || u.status === "deleted") throw new NotFoundError();
    await db.insert(clubManagers).values({ clubId, userId, assignedBy: actor.id }).onConflictDoNothing();
  } else {
    await db.delete(clubManagers).where(and(eq(clubManagers.clubId, clubId), eq(clubManagers.userId, userId)));
  }
  await audit(actor, assign ? "club_manager.assign" : "club_manager.remove", { type: "club", id: clubId }, null, { userId });
}

export async function listAllClubsForAdmin(actor: Actor) {
  assertAdmin(actor);
  return db
    .select({
      id: clubs.id,
      slug: clubs.slug,
      name: clubs.name,
      category: clubs.category,
      deletedAt: clubs.deletedAt,
      hiddenByReports: clubs.hiddenByReports,
      instagram: sql<string | null>`${clubs.socials}->>'instagram'`,
      managers: sql<number>`(select count(*)::int from ${clubManagers} m where m.club_id = ${clubs.id})`,
    })
    .from(clubs)
    .orderBy(asc(clubs.name));
}

export async function clubsManagedBy(userIds: string[]) {
  if (userIds.length === 0) return [];
  return db
    .select({ userId: clubManagers.userId, clubId: clubs.id, name: clubs.name, slug: clubs.slug })
    .from(clubManagers)
    .innerJoin(clubs, eq(clubs.id, clubManagers.clubId))
    .where(inArray(clubManagers.userId, userIds));
}

export async function clubOptionsFor(actor: Actor) {
  const conds = [isNull(clubs.deletedAt)];
  if (!actor.isAdmin) {
    if (actor.managedClubIds.length === 0) return [];
    conds.push(inArray(clubs.id, actor.managedClubIds));
  }
  return db
    .select({ id: clubs.id, name: clubs.name })
    .from(clubs)
    .where(and(...conds))
    .orderBy(asc(clubs.name));
}
