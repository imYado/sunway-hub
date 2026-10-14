import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import {
  bookmarks,
  clubs,
  eventRsvps,
  events,
  helpfulVotes,
  postSubjects,
  postTitleHistory,
  posts,
  storedFiles,
  subjects,
  users,
} from "@/db/schema";
import { parseKlInput } from "@/lib/dates";
import { MAX_FILES_PER_POST } from "@/lib/files";
import { DESCRIPTION_MAX, MAX_SUBJECT_TAGS, SEMESTER_RE, slugify, titleSchema } from "@/lib/rules";
import type { Actor } from "../actor-types";
import { audit } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { assertClean } from "../profanity";
import { enforce, LIMITS } from "../rate-limit";
import { getSettings } from "../settings";
import { storage } from "../storage";
import { notify, notifyFollowersOfPost } from "./notifications";
import { assertCanViewPost, canDeletePost, canEditTitle, canInteract, canViewPost, managesClub } from "./policy";
import { finaliseUploads } from "./uploads";

export const PAGE_SIZE = 20;
export const PURGE_AFTER_DAYS = 30;

export type PostRow = typeof posts.$inferSelect;

// ---------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------
export function cleanSubjectName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function upsertSubjects(names: string[]): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  for (const raw of names) {
    const name = cleanSubjectName(raw);
    const slug = slugify(name);
    if (!slug) continue;
    await db.insert(subjects).values({ slug, name }).onConflictDoNothing();
    const [row] = await db.select({ id: subjects.id, name: subjects.name }).from(subjects).where(eq(subjects.slug, slug)).limit(1);
    if (row && !out.some((o) => o.id === row.id)) out.push(row);
  }
  return out;
}

export async function suggestSubjects(q: string, limit = 8) {
  const term = q.trim().slice(0, 50);
  if (!term) {
    return db.select({ name: subjects.name, slug: subjects.slug }).from(subjects).orderBy(asc(subjects.name)).limit(limit);
  }
  return db
    .select({ name: subjects.name, slug: subjects.slug })
    .from(subjects)
    .where(or(sql`${subjects.name} ilike ${"%" + term.replace(/[%_\\]/g, "\\$&") + "%"}`, sql`${subjects.name} % ${term}`))
    .orderBy(sql`similarity(${subjects.name}, ${term}) desc`)
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export const createPostSchema = z
  .object({
    type: z.enum(["study", "event", "club"]),
    title: titleSchema,
    description: z.string().trim().max(DESCRIPTION_MAX, `Descriptions can be at most ${DESCRIPTION_MAX} characters.`).default(""),
    subjects: z.array(z.string().trim().min(1).max(80)).max(MAX_SUBJECT_TAGS).default([]),
    semester: z
      .string()
      .trim()
      .regex(SEMESTER_RE, "Choose a semester like \"Jan 2026\".")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    clubId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    ownWork: z.literal(true, { errorMap: () => ({ message: "Please confirm that you have the right to share this." }) }),
    files: z
      .array(z.object({ pathname: z.string().min(1).max(500), name: z.string().min(1).max(200) }))
      .max(MAX_FILES_PER_POST, `You can attach up to ${MAX_FILES_PER_POST} files.`)
      .default([]),
    event: z
      .object({
        startsAt: z.string(),
        endsAt: z.string().optional().or(z.literal("")),
        location: z.string().trim().min(2, "Add a location.").max(200),
        capacity: z.coerce.number().int().min(1).max(100000).optional().or(z.literal("").transform(() => undefined)),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "event" && !v.event) ctx.addIssue({ code: "custom", message: "Events need a date, time and location.", path: ["event"] });
    if (v.type === "club" && !v.clubId) ctx.addIssue({ code: "custom", message: "Choose the club this post is for.", path: ["clubId"] });
    if (v.type === "study" && v.subjects.length === 0) {
      ctx.addIssue({ code: "custom", message: "Add at least one subject tag.", path: ["subjects"] });
    }
  });

export type CreatePostInput = z.input<typeof createPostSchema>;

export async function createPost(actor: Actor, raw: CreatePostInput): Promise<{ id: string; status: string }> {
  const input = createPostSchema.parse(raw);
  await enforce("write", actor.id, LIMITS.writePerUser.limit, LIMITS.writePerUser.window);
  await assertClean(input.title, input.description, ...input.subjects, input.event?.location);

  if (input.clubId) {
    const [club] = await db.select({ id: clubs.id }).from(clubs).where(and(eq(clubs.id, input.clubId), isNull(clubs.deletedAt))).limit(1);
    if (!club) throw new AppError("That club does not exist.");
    if (!managesClub(actor, input.clubId)) throw new ForbiddenError("Only this club's managers can post for the club.");
  }

  let eventData: { startsAt: Date; endsAt: Date | null; location: string; capacity: number | null } | null = null;
  if (input.type === "event" && input.event) {
    const startsAt = parseKlInput(input.event.startsAt);
    const endsAt = input.event.endsAt ? parseKlInput(input.event.endsAt) : null;
    if (!startsAt) throw new AppError("Enter a valid start date and time.");
    if (input.event.endsAt && !endsAt) throw new AppError("Enter a valid end date and time.");
    if (endsAt && endsAt <= startsAt) throw new AppError("The event must end after it starts.");
    eventData = { startsAt, endsAt, location: input.event.location, capacity: input.event.capacity ?? null };
  }

  const subjectRows = await upsertSubjects(input.subjects);
  const postId = randomUUID();
  const files = await finaliseUploads(actor, postId, input.files);
  const autoApproved = actor.isAdmin;

  try {
    await db.transaction(async (tx) => {
      await tx.insert(posts).values({
        id: postId,
        authorId: actor.id,
        type: input.type,
        title: input.title,
        description: input.description,
        subjectText: subjectRows.map((s) => s.name).join(" "),
        semester: input.semester ?? null,
        clubId: input.clubId ?? null,
        status: autoApproved ? "approved" : "pending",
        decidedAt: autoApproved ? new Date() : null,
        decidedBy: autoApproved ? actor.id : null,
        ownWorkConfirmedAt: new Date(),
      });
      if (subjectRows.length) {
        await tx.insert(postSubjects).values(subjectRows.map((s) => ({ postId, subjectId: s.id })));
      }
      if (eventData) await tx.insert(events).values({ postId, ...eventData });
      if (files.length) {
        await tx.insert(storedFiles).values(
          files.map((f, i) => ({
            ownerId: actor.id,
            purpose: "attachment" as const,
            postId,
            position: i,
            ...f,
          })),
        );
      }
    });
  } catch (err) {
    await storage()
      .delete(files.map((f) => f.storagePath))
      .catch(() => {});
    throw err;
  }
  if (autoApproved) {
    await notifyFollowersOfPost({ id: postId, authorId: actor.id, title: input.title, clubId: input.clubId ?? null });
  }
  return { id: postId, status: autoApproved ? "approved" : "pending" };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export interface PostCard {
  id: string;
  type: "study" | "event" | "club";
  title: string;
  description: string;
  semester: string | null;
  status: PostRow["status"];
  titleEdited: boolean;
  helpfulCount: number;
  createdAt: Date;
  hiddenByReports: boolean;
  deletedAt: Date | null;
  decisionReason: string | null;
  author: { id: string; username: string | null; displayName: string | null; deleted: boolean; verifiedTeacher: boolean };
  club: { slug: string; name: string } | null;
  subjects: { name: string; slug: string }[];
  event: { startsAt: Date; endsAt: Date | null; location: string } | null;
  fileCount: number;
}

const cardSelect = {
  id: posts.id,
  type: posts.type,
  title: posts.title,
  description: posts.description,
  semester: posts.semester,
  status: posts.status,
  titleEdited: posts.titleEdited,
  helpfulCount: posts.helpfulCount,
  createdAt: posts.createdAt,
  hiddenByReports: posts.hiddenByReports,
  deletedAt: posts.deletedAt,
  decisionReason: posts.decisionReason,
  authorId: users.id,
  authorUsername: users.username,
  authorName: users.displayName,
  authorStatus: users.status,
  authorTeacher: users.teacherVerified,
  clubSlug: clubs.slug,
  clubName: clubs.name,
  eventStartsAt: events.startsAt,
  eventEndsAt: events.endsAt,
  eventLocation: events.location,
};

type CardRow = {
  [K in keyof typeof cardSelect]: unknown;
};

async function hydrateCards(rows: CardRow[]): Promise<PostCard[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id as string);
  const subjectRows = await db
    .select({ postId: postSubjects.postId, name: subjects.name, slug: subjects.slug })
    .from(postSubjects)
    .innerJoin(subjects, eq(subjects.id, postSubjects.subjectId))
    .where(inArray(postSubjects.postId, ids));
  const fileCounts = await db
    .select({ postId: storedFiles.postId, n: count() })
    .from(storedFiles)
    .where(and(inArray(storedFiles.postId, ids), isNull(storedFiles.deletedAt)))
    .groupBy(storedFiles.postId);
  return rows.map((r) => {
    const deleted = r.authorStatus === "deleted";
    return {
      id: r.id as string,
      type: r.type as PostCard["type"],
      title: r.title as string,
      description: r.description as string,
      semester: r.semester as string | null,
      status: r.status as PostRow["status"],
      titleEdited: r.titleEdited as boolean,
      helpfulCount: r.helpfulCount as number,
      createdAt: r.createdAt as Date,
      hiddenByReports: r.hiddenByReports as boolean,
      deletedAt: r.deletedAt as Date | null,
      decisionReason: r.decisionReason as string | null,
      author: {
        id: r.authorId as string,
        username: deleted ? null : (r.authorUsername as string | null),
        displayName: deleted ? "Deleted user" : (r.authorName as string | null),
        deleted,
        verifiedTeacher: !deleted && (r.authorTeacher as boolean),
      },
      club: r.clubSlug ? { slug: r.clubSlug as string, name: r.clubName as string } : null,
      subjects: subjectRows.filter((s) => s.postId === r.id).map((s) => ({ name: s.name, slug: s.slug })),
      event: r.eventStartsAt
        ? { startsAt: r.eventStartsAt as Date, endsAt: r.eventEndsAt as Date | null, location: r.eventLocation as string }
        : null,
      fileCount: Number(fileCounts.find((f) => f.postId === r.id)?.n ?? 0),
    };
  });
}

function baseCardQuery() {
  return db
    .select(cardSelect)
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(clubs, eq(clubs.id, posts.clubId))
    .leftJoin(events, eq(events.postId, posts.id));
}

/** Only approved, not hidden, not deleted posts are visible to members in lists. */
export function publicCondition(): SQL {
  return and(eq(posts.status, "approved"), eq(posts.hiddenByReports, false), isNull(posts.deletedAt)) as SQL;
}

export interface SearchFilters {
  q?: string;
  type?: "study" | "event" | "club";
  subject?: string; // subject slug
  semester?: string;
  verifiedTeacher?: boolean;
  club?: string; // club slug
  sort?: "newest" | "helpful";
  page?: number;
}

export async function searchPosts(actor: Actor, f: SearchFilters): Promise<{ items: PostCard[]; total: number; page: number; pages: number }> {
  if (f.q) await enforce("search", actor.id, LIMITS.searchPerUser.limit, LIMITS.searchPerUser.window);
  const page = Math.max(1, Math.min(500, Math.floor(f.page ?? 1)));
  const conds: SQL[] = [publicCondition()];
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    conds.push(sql`(${posts.search} @@ websearch_to_tsquery('english', ${q}) or ${posts.title} % ${q} or ${posts.subjectText} ilike ${"%" + q.replace(/[%_\\]/g, "\\$&") + "%"})`);
  }
  if (f.type) conds.push(eq(posts.type, f.type));
  if (f.semester) conds.push(eq(posts.semester, f.semester));
  if (f.verifiedTeacher) conds.push(eq(users.teacherVerified, true));
  if (f.club) conds.push(eq(clubs.slug, f.club));
  if (f.subject) {
    conds.push(
      sql`exists (select 1 from ${postSubjects} ps join ${subjects} s on s.id = ps.subject_id where ps.post_id = ${posts.id} and s.slug = ${f.subject})`,
    );
  }
  const where = and(...conds);
  const order =
    f.sort === "helpful"
      ? [desc(posts.helpfulCount), desc(posts.createdAt)]
      : q
        ? [desc(sql`ts_rank(${posts.search}, websearch_to_tsquery('english', ${q}))`), desc(posts.createdAt)]
        : [desc(posts.createdAt)];
  const [totalRow] = await db
    .select({ n: count() })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(clubs, eq(clubs.id, posts.clubId))
    .where(where);
  const total = Number(totalRow?.n ?? 0);
  const rows = await baseCardQuery()
    .where(where)
    .orderBy(...order)
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return { items: await hydrateCards(rows), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function listFeed(actor: Actor, page = 1) {
  return searchPosts(actor, { page, sort: "newest" });
}

export type ProfileTab = "posts" | "pending" | "rejected" | "bookmarks";

export async function listProfilePosts(actor: Actor, userId: string, tab: ProfileTab): Promise<PostCard[]> {
  const own = actor.id === userId || actor.isAdmin;
  if (tab !== "posts" && !own) throw new ForbiddenError();
  if (tab === "bookmarks") {
    if (actor.id !== userId) throw new ForbiddenError();
    const rows = await baseCardQuery()
      .innerJoin(bookmarks, and(eq(bookmarks.postId, posts.id), eq(bookmarks.userId, userId)))
      .where(publicCondition())
      .orderBy(desc(bookmarks.createdAt))
      .limit(100);
    return hydrateCards(rows);
  }
  const cond =
    tab === "posts"
      ? and(eq(posts.authorId, userId), publicCondition())
      : tab === "pending"
        ? and(eq(posts.authorId, userId), isNull(posts.deletedAt), eq(posts.status, "pending"))
        : and(
            eq(posts.authorId, userId),
            isNull(posts.deletedAt),
            or(eq(posts.status, "rejected"), eq(posts.status, "changes_requested")),
          );
  const rows = await baseCardQuery().where(cond).orderBy(desc(posts.createdAt)).limit(100);
  return hydrateCards(rows);
}

export interface PostDetail extends PostCard {
  authorId: string;
  clubId: string | null;
  decisionReason: string | null;
  files: { id: string; name: string; kind: string; contentType: string; size: number; width: number | null; height: number | null }[];
  event: { startsAt: Date; endsAt: Date | null; location: string; capacity: number | null; going: number; interested: number } | null;
  viewer: {
    isOwner: boolean;
    isAdmin: boolean;
    helpful: boolean;
    bookmarked: boolean;
    rsvp: "going" | "interested" | null;
    canEditTitle: boolean;
    canDelete: boolean;
    canInteract: boolean;
  };
  titleHistory: { oldTitle: string; newTitle: string; editedAt: Date; revertedAt: Date | null; id: string }[];
}

export async function getPostDetail(actor: Actor, postId: string): Promise<PostDetail> {
  if (!z.string().uuid().safeParse(postId).success) throw new NotFoundError();
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  assertCanViewPost(actor, post);
  const p = post as PostRow;
  const [card] = await hydrateCards(await baseCardQuery().where(eq(posts.id, postId)).limit(1));
  const files = await db
    .select()
    .from(storedFiles)
    .where(and(eq(storedFiles.postId, postId), isNull(storedFiles.deletedAt)))
    .orderBy(asc(storedFiles.position));
  const [ev] = await db.select().from(events).where(eq(events.postId, postId)).limit(1);
  let going = 0;
  let interested = 0;
  if (ev) {
    const counts = await db
      .select({ status: eventRsvps.status, n: count() })
      .from(eventRsvps)
      .where(eq(eventRsvps.postId, postId))
      .groupBy(eventRsvps.status);
    going = Number(counts.find((c) => c.status === "going")?.n ?? 0);
    interested = Number(counts.find((c) => c.status === "interested")?.n ?? 0);
  }
  const [helpful] = await db
    .select()
    .from(helpfulVotes)
    .where(and(eq(helpfulVotes.postId, postId), eq(helpfulVotes.userId, actor.id)))
    .limit(1);
  const [bm] = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.postId, postId), eq(bookmarks.userId, actor.id)))
    .limit(1);
  const [rsvp] = await db
    .select()
    .from(eventRsvps)
    .where(and(eq(eventRsvps.postId, postId), eq(eventRsvps.userId, actor.id)))
    .limit(1);
  const history = actor.isAdmin
    ? await db.select().from(postTitleHistory).where(eq(postTitleHistory.postId, postId)).orderBy(desc(postTitleHistory.editedAt))
    : [];
  return {
    ...card,
    authorId: p.authorId,
    clubId: p.clubId,
    decisionReason: p.authorId === actor.id || actor.isAdmin ? p.decisionReason : null,
    files: files.map((f) => ({
      id: f.id,
      name: f.originalName,
      kind: f.kind,
      contentType: f.contentType,
      size: f.size,
      width: f.width,
      height: f.height,
    })),
    event: ev ? { startsAt: ev.startsAt, endsAt: ev.endsAt, location: ev.location, capacity: ev.capacity, going, interested } : null,
    viewer: {
      isOwner: p.authorId === actor.id,
      isAdmin: actor.isAdmin,
      helpful: !!helpful,
      bookmarked: !!bm,
      rsvp: rsvp?.status ?? null,
      canEditTitle: canEditTitle(actor, p),
      canDelete: canDeletePost(actor, p),
      canInteract: canInteract(actor, p),
    },
    titleHistory: history.map((h) => ({ id: h.id, oldTitle: h.oldTitle, newTitle: h.newTitle, editedAt: h.editedAt, revertedAt: h.revertedAt })),
  };
}

/** Used by the file route: may this actor download this file? */
export async function getFileForViewer(actor: Actor, fileId: string) {
  if (!z.string().uuid().safeParse(fileId).success) return null;
  const [file] = await db.select().from(storedFiles).where(eq(storedFiles.id, fileId)).limit(1);
  if (!file || file.purpose !== "attachment" || !file.postId) return null;
  if (file.deletedAt && !actor.isAdmin) return null;
  const [post] = await db.select().from(posts).where(eq(posts.id, file.postId)).limit(1);
  if (!post || !canViewPost(actor, post)) return null;
  return file;
}

// ---------------------------------------------------------------------------
// Mutations by the poster
// ---------------------------------------------------------------------------
async function loadPost(postId: string): Promise<PostRow> {
  if (!z.string().uuid().safeParse(postId).success) throw new NotFoundError();
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!post) throw new NotFoundError();
  return post;
}

/** Posters may edit the title only. Every edit is kept in the history for the admin. */
export async function editPostTitle(actor: Actor, postId: string, rawTitle: string): Promise<void> {
  const title = titleSchema.parse(rawTitle);
  const post = await loadPost(postId);
  if (!canEditTitle(actor, post)) throw new ForbiddenError("You can only edit the title of your own posts.");
  if (title === post.title) return;
  await enforce("write", actor.id, LIMITS.writePerUser.limit, LIMITS.writePerUser.window);
  await assertClean(title);
  const settings = await getSettings();
  const needsReapproval = settings.requireReapprovalAfterTitleEdit && post.status === "approved" && !actor.isAdmin;
  await db.transaction(async (tx) => {
    await tx.insert(postTitleHistory).values({ postId, oldTitle: post.title, newTitle: title, editedBy: actor.id });
    await tx
      .update(posts)
      .set({ title, titleEdited: true, updatedAt: new Date(), ...(needsReapproval ? { status: "pending" as const } : {}) })
      .where(eq(posts.id, postId));
  });
}

/** Soft delete: hidden immediately, purged after 30 days. Admin must give a reason for other people's posts. */
export async function deletePost(actor: Actor, postId: string, reason?: string): Promise<void> {
  const post = await loadPost(postId);
  if (!canDeletePost(actor, post)) throw new ForbiddenError();
  const byAdminForOther = actor.isAdmin && post.authorId !== actor.id;
  const cleanReason = reason?.trim().slice(0, 500) || null;
  if (byAdminForOther && !cleanReason) throw new AppError("Please give a reason. It will be sent to the poster.");
  await db
    .update(posts)
    .set({ deletedAt: new Date(), deletedBy: actor.id, deleteReason: cleanReason, updatedAt: new Date() })
    .where(and(eq(posts.id, postId), isNull(posts.deletedAt)));
  await audit(actor, byAdminForOther ? "post.delete_by_admin" : "post.delete_by_owner", { type: "post", id: postId }, cleanReason, {
    title: post.title,
  });
  if (byAdminForOther) {
    await notify([post.authorId], {
      kind: "decision",
      title: `Your post "${post.title}" was removed`,
      body: `Reason: ${cleanReason}`,
      link: null,
    });
  }
}

export async function toggleHelpful(actor: Actor, postId: string): Promise<boolean> {
  const post = await loadPost(postId);
  if (!canInteract(actor, post)) throw new NotFoundError();
  if (post.authorId === actor.id) throw new AppError("You cannot mark your own post as helpful.");
  const existing = await db
    .delete(helpfulVotes)
    .where(and(eq(helpfulVotes.postId, postId), eq(helpfulVotes.userId, actor.id)))
    .returning();
  const added = existing.length === 0;
  if (added) await db.insert(helpfulVotes).values({ postId, userId: actor.id }).onConflictDoNothing();
  await db
    .update(posts)
    .set({ helpfulCount: sql`(select count(*) from helpful_votes where post_id = ${postId})` })
    .where(eq(posts.id, postId));
  return added;
}

export async function toggleBookmark(actor: Actor, postId: string): Promise<boolean> {
  const post = await loadPost(postId);
  if (!canInteract(actor, post)) throw new NotFoundError();
  const existing = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.postId, postId), eq(bookmarks.userId, actor.id)))
    .returning();
  if (existing.length === 0) {
    await db.insert(bookmarks).values({ postId, userId: actor.id }).onConflictDoNothing();
    return true;
  }
  return false;
}

export async function setRsvp(actor: Actor, postId: string, status: "going" | "interested" | "none"): Promise<void> {
  const post = await loadPost(postId);
  if (!canInteract(actor, post) || post.type !== "event") throw new NotFoundError();
  if (status === "none") {
    await db.delete(eventRsvps).where(and(eq(eventRsvps.postId, postId), eq(eventRsvps.userId, actor.id)));
    return;
  }
  const [ev] = await db.select().from(events).where(eq(events.postId, postId)).limit(1);
  if (!ev) throw new NotFoundError();
  if (status === "going" && ev.capacity) {
    const [r] = await db
      .select({ n: count() })
      .from(eventRsvps)
      .where(and(eq(eventRsvps.postId, postId), eq(eventRsvps.status, "going"), ne(eventRsvps.userId, actor.id)));
    if (Number(r?.n ?? 0) >= ev.capacity) throw new AppError("This event is full. You can still mark yourself as interested.");
  }
  await db
    .insert(eventRsvps)
    .values({ postId, userId: actor.id, status })
    .onConflictDoUpdate({ target: [eventRsvps.postId, eventRsvps.userId], set: { status } });
}

export async function getEventForIcs(actor: Actor, postId: string) {
  const post = await loadPost(postId);
  if (!canViewPost(actor, post) || post.type !== "event") throw new NotFoundError();
  const [ev] = await db.select().from(events).where(eq(events.postId, postId)).limit(1);
  if (!ev) throw new NotFoundError();
  return { post, event: ev };
}

export interface EventListItem {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  club: { slug: string; name: string } | null;
}

export async function listEvents(actor: Actor, opts: { from: Date; to?: Date; clubId?: string; limit?: number }): Promise<EventListItem[]> {
  void actor;
  const conds: SQL[] = [publicCondition(), sql`coalesce(${events.endsAt}, ${events.startsAt}) >= ${opts.from}`];
  if (opts.to) conds.push(sql`${events.startsAt} < ${opts.to}`);
  if (opts.clubId) conds.push(eq(posts.clubId, opts.clubId));
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      location: events.location,
      clubSlug: clubs.slug,
      clubName: clubs.name,
    })
    .from(events)
    .innerJoin(posts, eq(posts.id, events.postId))
    .leftJoin(clubs, eq(clubs.id, posts.clubId))
    .where(and(...conds))
    .orderBy(asc(events.startsAt))
    .limit(opts.limit ?? 200);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    location: r.location,
    club: r.clubSlug ? { slug: r.clubSlug, name: r.clubName as string } : null,
  }));
}

export async function listSubjects() {
  return db
    .select({
      slug: subjects.slug,
      name: subjects.name,
      posts: sql<number>`(select count(*)::int from ${postSubjects} ps join ${posts} p on p.id = ps.post_id where ps.subject_id = ${subjects.id} and p.status = 'approved' and p.deleted_at is null and p.hidden_by_reports = false)`,
    })
    .from(subjects)
    .orderBy(asc(subjects.name));
}

export async function getSubject(slug: string) {
  const [s] = await db.select().from(subjects).where(eq(subjects.slug, slug)).limit(1);
  return s ?? null;
}

export async function semestersForSubject(subjectId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ semester: posts.semester })
    .from(posts)
    .innerJoin(postSubjects, eq(postSubjects.postId, posts.id))
    .where(and(eq(postSubjects.subjectId, subjectId), publicCondition(), isNotNull(posts.semester)));
  return rows.map((r) => r.semester as string).sort((a, b) => semesterSortKey(b) - semesterSortKey(a));
}

export function semesterSortKey(s: string): number {
  const m = /^(\w{3}) (\d{4})$/.exec(s);
  if (!m) return 0;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Number(m[2]) * 12 + months.indexOf(m[1]);
}
