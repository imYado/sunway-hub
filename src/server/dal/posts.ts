import "server-only";
import { clientIp } from "../request";
import { assertSunwayVerified } from "./verification";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import {
  bookmarks,
  clubs,
  comments,
  eventRsvps,
  events,
  postSubjects,
  postVotes,
  postTitleHistory,
  posts,
  type PostLink,
  storedFiles,
  subjects,
  userAvatars,
  users,
} from "@/db/schema";
import { parseKlInput } from "@/lib/dates";
import { MAX_FILES_PER_POST } from "@/lib/files";
import type { MarketKind, PostType } from "@/lib/rules";
import {
  DESCRIPTION_MAX,
  LINK_LABEL_MAX,
  MAX_LINKS_PER_POST,
  MAX_TAGS,
  SEMESTER_RE,
  cleanLinkUrl,
  slugify,
  titleSchema,
} from "@/lib/rules";
import type { Actor } from "../actor-types";
import { audit } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { assertClean } from "../profanity";
import { enforce, LIMITS } from "../rate-limit";
import { storage } from "../storage";
import { notify, notifyFollowersOfPost } from "./notifications";
import { assertCanViewPost, canDeletePost, canEditPost, canInteract, canViewPost, managesClub } from "./policy";
import { finaliseUploads } from "./uploads";

export type VoteValue = 1 | -1;

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
    type: z.enum(["discussion", "study", "event", "club", "market"]),
    marketKind: z.enum(["sell", "buy", "swap", "borrow"]).optional().or(z.literal("").transform(() => undefined)),
    title: titleSchema,
    description: z.string().trim().max(DESCRIPTION_MAX, `Descriptions can be at most ${DESCRIPTION_MAX} characters.`).default(""),
    subjects: z.array(z.string().trim().min(1).max(80)).max(MAX_TAGS).default([]),
    semester: z
      .string()
      .trim()
      .regex(SEMESTER_RE, "Choose a semester like \"Jan 2026\".")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    clubId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
    links: z
      .array(
        z.object({
          url: z.string().transform((v, ctx) => {
            const url = cleanLinkUrl(v);
            if (!url) ctx.addIssue({ code: "custom", message: `"${v.slice(0, 60)}" is not a valid web link.` });
            return url ?? "";
          }),
          label: z.string().trim().max(LINK_LABEL_MAX, `Link names can be at most ${LINK_LABEL_MAX} characters.`).default(""),
        }),
      )
      .max(MAX_LINKS_PER_POST, `You can add up to ${MAX_LINKS_PER_POST} links.`)
      .default([]),
    anonymous: z.boolean().default(false),
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
    if (v.type === "club" && v.anonymous) {
      ctx.addIssue({ code: "custom", message: "Club posts can't be anonymous.", path: ["anonymous"] });
    }
    if (v.type === "market" && !v.marketKind) {
      ctx.addIssue({ code: "custom", message: "Choose whether you're selling, buying, swapping or lending.", path: ["marketKind"] });
    }
    if (v.type === "study" && v.subjects.length === 0) {
      ctx.addIssue({ code: "custom", message: "Add at least one tag, like the course code.", path: ["subjects"] });
    }
  });

export type CreatePostInput = z.input<typeof createPostSchema>;

type ParsedPost = z.output<typeof createPostSchema>;
type EventData = { startsAt: Date; endsAt: Date | null; location: string; capacity: number | null };

/** Checks shared by creating and editing a post. Returns the cleaned links and event details. */
async function checkPostContent(actor: Actor, input: ParsedPost): Promise<{ links: PostLink[]; eventData: EventData | null }> {
  const links: PostLink[] = input.links.map((l) => ({ url: l.url, label: l.label || new URL(l.url).hostname.replace(/^www\./, "") }));
  await assertClean(input.title, input.description, ...input.subjects, input.event?.location, ...links.map((l) => l.label));

  if (input.clubId) {
    const [club] = await db.select({ id: clubs.id }).from(clubs).where(and(eq(clubs.id, input.clubId), isNull(clubs.deletedAt))).limit(1);
    if (!club) throw new AppError("That club does not exist.");
    // Anyone can tag a club; only its managers can post as the club.
    if (input.type === "club" && !managesClub(actor, input.clubId)) throw new ForbiddenError("Only this club's managers can post for the club.");
  }

  let eventData: EventData | null = null;
  if (input.type === "event" && input.event) {
    const startsAt = parseKlInput(input.event.startsAt);
    const endsAt = input.event.endsAt ? parseKlInput(input.event.endsAt) : null;
    if (!startsAt) throw new AppError("Enter a valid start date and time.");
    if (input.event.endsAt && !endsAt) throw new AppError("Enter a valid end date and time.");
    if (endsAt && endsAt <= startsAt) throw new AppError("The event must end after it starts.");
    eventData = { startsAt, endsAt, location: input.event.location, capacity: input.event.capacity ?? null };
  }
  return { links, eventData };
}

export async function createPost(actor: Actor, raw: CreatePostInput): Promise<{ id: string; status: string }> {
  const input = createPostSchema.parse(raw);
  await enforce("write", actor.id, LIMITS.writePerUser.limit, LIMITS.writePerUser.window);
  if (input.type === "market") await assertSunwayVerified(actor);
  const { links, eventData } = await checkPostContent(actor, input);

  const subjectRows = await upsertSubjects(input.subjects);
  const postId = randomUUID();
  const files = await finaliseUploads(actor, postId, input.files);
  // Posts go live straight away. Until the admin has looked at one, decidedAt stays
  // empty and it shows in the admin's review queue (see needsReviewCondition).
  const reviewed = actor.isAdmin;

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
        links,
        anonymous: input.anonymous,
        marketKind: input.type === "market" ? (input.marketKind ?? null) : null,
        status: "approved",
        decidedAt: reviewed ? new Date() : null,
        decidedBy: reviewed ? actor.id : null,
        // Posting means agreeing to the notice beside the Post button, so record when that happened.
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
  await notifyFollowersOfPost({ id: postId, authorId: actor.id, title: input.title, clubId: input.type === "club" ? (input.clubId ?? null) : null });
  return { id: postId, status: "approved" };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export interface PostCard {
  id: string;
  type: PostType;
  marketKind: MarketKind | null;
  title: string;
  description: string;
  semester: string | null;
  status: PostRow["status"];
  titleEdited: boolean;
  editedAt: Date | null;
  score: number;
  commentCount: number;
  /** The viewer's own vote on this post. */
  viewerVote: VoteValue | null;
  viewerIsAuthor: boolean;
  createdAt: Date;
  hiddenByReports: boolean;
  deletedAt: Date | null;
  decisionReason: string | null;
  /** For anonymous posts, only the poster and the admin see who wrote it. */
  author: { id: string; username: string | null; displayName: string | null; deleted: boolean; verifiedTeacher: boolean; anonymous: boolean; notSunway: boolean; hasAvatar: boolean };
  club: { slug: string; name: string } | null;
  subjects: { name: string; slug: string }[];
  event: { startsAt: Date; endsAt: Date | null; location: string } | null;
  fileCount: number;
  links: PostLink[];
}

const cardSelect = {
  id: posts.id,
  type: posts.type,
  marketKind: posts.marketKind,
  title: posts.title,
  description: posts.description,
  semester: posts.semester,
  status: posts.status,
  titleEdited: posts.titleEdited,
  editedAt: posts.editedAt,
  score: posts.score,
  commentCount: posts.commentCount,
  createdAt: posts.createdAt,
  hiddenByReports: posts.hiddenByReports,
  deletedAt: posts.deletedAt,
  decisionReason: posts.decisionReason,
  links: posts.links,
  anonymous: posts.anonymous,
  authorId: users.id,
  authorUsername: users.username,
  authorName: users.displayName,
  authorStatus: users.status,
  authorTeacher: users.teacherVerified,
  authorSunway: users.sunwayVerified,
  authorAvatar: userAvatars.approvedFileId,
  clubSlug: clubs.slug,
  clubName: clubs.name,
  eventStartsAt: events.startsAt,
  eventEndsAt: events.endsAt,
  eventLocation: events.location,
};

type CardRow = {
  [K in keyof typeof cardSelect]: unknown;
};

async function hydrateCards(actor: Actor, rows: CardRow[]): Promise<PostCard[]> {
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
  const votes = await db
    .select({ postId: postVotes.postId, value: postVotes.value })
    .from(postVotes)
    .where(and(inArray(postVotes.postId, ids), eq(postVotes.userId, actor.id)));
  return rows.map((r) => {
    const deleted = r.authorStatus === "deleted";
    const anonymous = r.anonymous as boolean;
    const masked = anonymous && !actor.isAdmin && actor.id !== r.authorId;
    return {
      id: r.id as string,
      type: r.type as PostCard["type"],
      marketKind: (r.marketKind as MarketKind | null) ?? null,
      title: r.title as string,
      description: r.description as string,
      semester: r.semester as string | null,
      status: r.status as PostRow["status"],
      titleEdited: r.titleEdited as boolean,
      editedAt: r.editedAt as Date | null,
      score: r.score as number,
      commentCount: r.commentCount as number,
      viewerVote: (votes.find((v) => v.postId === r.id)?.value as VoteValue | undefined) ?? null,
      viewerIsAuthor: r.authorId === actor.id,
      createdAt: r.createdAt as Date,
      hiddenByReports: r.hiddenByReports as boolean,
      deletedAt: r.deletedAt as Date | null,
      decisionReason: r.decisionReason as string | null,
      author: masked
        ? { id: "", username: null, displayName: null, deleted: false, verifiedTeacher: false, anonymous: true, notSunway: false, hasAvatar: false }
        : {
            id: r.authorId as string,
            username: deleted ? null : (r.authorUsername as string | null),
            displayName: deleted ? "Deleted user" : (r.authorName as string | null),
            deleted,
            verifiedTeacher: !deleted && (r.authorTeacher as boolean),
            anonymous,
            notSunway: !deleted && !(r.authorSunway as boolean),
            hasAvatar: !deleted && !!r.authorAvatar,
          },
      club: r.clubSlug ? { slug: r.clubSlug as string, name: r.clubName as string } : null,
      subjects: subjectRows.filter((s) => s.postId === r.id).map((s) => ({ name: s.name, slug: s.slug })),
      event: r.eventStartsAt
        ? { startsAt: r.eventStartsAt as Date, endsAt: r.eventEndsAt as Date | null, location: r.eventLocation as string }
        : null,
      fileCount: Number(fileCounts.find((f) => f.postId === r.id)?.n ?? 0),
      links: (r.links as PostLink[] | null) ?? [],
    };
  });
}

function baseCardQuery() {
  return db
    .select(cardSelect)
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .leftJoin(userAvatars, eq(userAvatars.userId, posts.authorId))
    .leftJoin(clubs, eq(clubs.id, posts.clubId))
    .leftJoin(events, eq(events.postId, posts.id));
}

/** Only approved, not hidden, not deleted posts are visible to members in lists. */
export function publicCondition(): SQL {
  return and(eq(posts.status, "approved"), eq(posts.hiddenByReports, false), isNull(posts.deletedAt)) as SQL;
}

export type PostSort = "hot" | "new" | "top";

/** Reads a sort from a URL. Old links used "newest" and "helpful". */
export function parseSort(raw: string | undefined, fallback: PostSort): PostSort {
  if (raw === "new" || raw === "newest") return "new";
  if (raw === "top" || raw === "helpful") return "top";
  if (raw === "hot") return "hot";
  return fallback;
}

// Reddit-style "hot": score counts on a log scale, and newer posts get a steady boost.
const hotRank = sql`(sign(${posts.score}) * log(greatest(abs(${posts.score}), 1)) + extract(epoch from ${posts.createdAt}) / 45000)`;

export interface SearchFilters {
  q?: string;
  type?: PostType;
  /** Leave these types out (the home page skips Market posts). */
  excludeTypes?: PostType[];
  marketKind?: MarketKind;
  subject?: string; // tag (subject) slug
  semester?: string;
  verifiedTeacher?: boolean;
  club?: string; // club slug
  sort?: PostSort;
  page?: number;
}

export async function searchPosts(actor: Actor, f: SearchFilters): Promise<{ items: PostCard[]; total: number; page: number; pages: number }> {
  // Guests all share one id, so limit them per IP instead.
  if (f.q) await enforce("search", actor.guest ? `guest:${await clientIp()}` : actor.id, LIMITS.searchPerUser.limit, LIMITS.searchPerUser.window);
  const page = Math.max(1, Math.min(500, Math.floor(f.page ?? 1)));
  const conds: SQL[] = [publicCondition()];
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    conds.push(sql`(${posts.search} @@ websearch_to_tsquery('english', ${q}) or ${posts.title} % ${q} or ${posts.subjectText} ilike ${"%" + q.replace(/[%_\\]/g, "\\$&") + "%"})`);
  }
  if (f.type) conds.push(eq(posts.type, f.type));
  if (f.excludeTypes?.length) conds.push(notInArray(posts.type, f.excludeTypes));
  if (f.marketKind) conds.push(eq(posts.marketKind, f.marketKind));
  if (f.semester) conds.push(eq(posts.semester, f.semester));
  // Anonymous posts never match, or the filter would reveal that a teacher wrote them.
  if (f.verifiedTeacher) conds.push(eq(users.teacherVerified, true), eq(posts.anonymous, false));
  if (f.club) conds.push(eq(clubs.slug, f.club));
  if (f.subject) {
    conds.push(
      sql`exists (select 1 from ${postSubjects} ps join ${subjects} s on s.id = ps.subject_id where ps.post_id = ${posts.id} and s.slug = ${f.subject})`,
    );
  }
  const where = and(...conds);
  const order =
    f.sort === "top"
      ? [desc(posts.score), desc(posts.createdAt)]
      : f.sort === "hot"
        ? [desc(hotRank), desc(posts.createdAt)]
        : q && !f.sort
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
  return { items: await hydrateCards(actor, rows), total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** The home page: every kind of post except Market listings, which have their own page. */
export async function listFeed(actor: Actor, opts: { page?: number; type?: PostType; sort?: PostSort; q?: string } = {}) {
  const type = opts.type === "market" ? undefined : opts.type;
  return searchPosts(actor, { page: opts.page ?? 1, type, excludeTypes: ["market"], sort: opts.sort ?? "hot", q: opts.q || undefined });
}

export async function listMarket(actor: Actor, opts: { page?: number; kind?: MarketKind; sort?: PostSort; q?: string } = {}) {
  return searchPosts(actor, { page: opts.page ?? 1, type: "market", marketKind: opts.kind, sort: opts.sort ?? "new", q: opts.q || undefined });
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
    return hydrateCards(actor, rows);
  }
  const cond =
    tab === "posts"
      ? and(eq(posts.authorId, userId), publicCondition(), own ? undefined : eq(posts.anonymous, false))
      : tab === "pending"
        ? and(eq(posts.authorId, userId), isNull(posts.deletedAt), eq(posts.status, "pending"))
        : and(
            eq(posts.authorId, userId),
            isNull(posts.deletedAt),
            or(eq(posts.status, "rejected"), eq(posts.status, "changes_requested")),
          );
  const rows = await baseCardQuery().where(cond).orderBy(desc(posts.createdAt)).limit(100);
  return hydrateCards(actor, rows);
}

export interface PostDetail extends PostCard {
  authorId: string;
  clubId: string | null;
  anonymous: boolean;
  decisionReason: string | null;
  files: { id: string; name: string; kind: string; contentType: string; size: number; width: number | null; height: number | null }[];
  event: { startsAt: Date; endsAt: Date | null; location: string; capacity: number | null; going: number; interested: number } | null;
  viewer: {
    isOwner: boolean;
    isAdmin: boolean;
    bookmarked: boolean;
    rsvp: "going" | "interested" | null;
    canEdit: boolean;
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
  const [card] = await hydrateCards(actor, await baseCardQuery().where(eq(posts.id, postId)).limit(1));
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
    authorId: card.author.id,
    clubId: p.clubId,
    anonymous: p.anonymous,
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
      bookmarked: !!bm,
      rsvp: rsvp?.status ?? null,
      canEdit: canEditPost(actor, p),
      canDelete: canDeletePost(actor, p),
      canInteract: !actor.guest && canInteract(actor, p),
    },
    titleHistory: history.map((h) => ({ id: h.id, oldTitle: h.oldTitle, newTitle: h.newTitle, editedAt: h.editedAt, revertedAt: h.revertedAt })),
  };
}

/** Used by the file route: may this actor download this file? */
export async function getFileForViewer(actor: Actor, fileId: string) {
  if (!z.string().uuid().safeParse(fileId).success) return null;
  const [file] = await db.select().from(storedFiles).where(eq(storedFiles.id, fileId)).limit(1);
  if (!file) return null;
  if (file.deletedAt && !actor.isAdmin) return null;
  let postId = file.postId;
  if (file.purpose === "comment_attachment" && file.commentId) {
    // Same visibility as the comment: gone once deleted, and hidden while reported (except for its author).
    const [c] = await db.select().from(comments).where(eq(comments.id, file.commentId)).limit(1);
    if (!c) return null;
    if (!actor.isAdmin && (c.deletedAt || (c.hiddenByReports && c.authorId !== actor.id))) return null;
    postId = c.postId;
  } else if (file.purpose !== "attachment") {
    return null;
  }
  if (!postId) return null;
  const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
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
  if (!canEditPost(actor, post)) throw new ForbiddenError("You can only edit your own posts.");
  if (title === post.title) return;
  await enforce("write", actor.id, LIMITS.writePerUser.limit, LIMITS.writePerUser.window);
  await assertClean(title);
  // An edited post stays live but goes back in the admin's review queue.
  const backToReview = post.status === "approved" && !actor.isAdmin;
  await db.transaction(async (tx) => {
    await tx.insert(postTitleHistory).values({ postId, oldTitle: post.title, newTitle: title, editedBy: actor.id });
    await tx
      .update(posts)
      .set({ title, titleEdited: true, editedAt: new Date(), updatedAt: new Date(), ...(backToReview ? { decidedAt: null, decidedBy: null } : {}) })
      .where(eq(posts.id, postId));
  });
}

export type EditPostInput = Omit<CreatePostInput, "type"> & { keepFileIds?: string[] };

/**
 * The poster edits their post. Rejected posts and posts with requested changes go back to
 * the approval queue; approved posts only do when the admin turned that setting on.
 */
export async function editPost(actor: Actor, postId: string, raw: EditPostInput): Promise<{ status: PostRow["status"] }> {
  const post = await loadPost(postId);
  if (!canEditPost(actor, post)) throw new ForbiddenError("You can only edit your own posts.");
  const input = createPostSchema.parse({ ...raw, type: post.type });
  await enforce("write", actor.id, LIMITS.writePerUser.limit, LIMITS.writePerUser.window);
  const { links, eventData } = await checkPostContent(actor, input);

  const existing = await db
    .select({ id: storedFiles.id, position: storedFiles.position })
    .from(storedFiles)
    .where(and(eq(storedFiles.postId, postId), isNull(storedFiles.deletedAt)));
  const keep = new Set((raw.keepFileIds ?? []).filter((id) => existing.some((f) => f.id === id)));
  const removed = existing.filter((f) => !keep.has(f.id)).map((f) => f.id);
  if (keep.size + input.files.length > MAX_FILES_PER_POST) throw new AppError(`You can attach up to ${MAX_FILES_PER_POST} files.`);

  // Rejected posts and posts with requested changes wait for the admin again; a live
  // post stays live but goes back in the admin's review queue.
  const status: PostRow["status"] = post.status === "rejected" || post.status === "changes_requested" ? "pending" : post.status;
  const backToReview = status === "approved" && !actor.isAdmin;
  const subjectRows = await upsertSubjects(input.subjects);
  const firstPosition = existing.reduce((m, f) => Math.max(m, f.position + 1), 0);
  const files = await finaliseUploads(actor, postId, input.files, { firstPosition });
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      if (input.title !== post.title) {
        await tx.insert(postTitleHistory).values({ postId, oldTitle: post.title, newTitle: input.title, editedBy: actor.id });
      }
      await tx
        .update(posts)
        .set({
          title: input.title,
          description: input.description,
          subjectText: subjectRows.map((r) => r.name).join(" "),
          semester: input.semester ?? null,
          clubId: input.clubId ?? null,
          links,
          anonymous: input.anonymous,
          marketKind: post.type === "market" ? (input.marketKind ?? null) : null,
          titleEdited: post.titleEdited || input.title !== post.title,
          editedAt: now,
          updatedAt: now,
          status,
          ...(status === "pending" && post.status !== "pending" ? { decisionReason: null, decidedAt: null, decidedBy: null } : {}),
          ...(backToReview ? { decidedAt: null, decidedBy: null } : {}),
        })
        .where(eq(posts.id, postId));
      await tx.delete(postSubjects).where(eq(postSubjects.postId, postId));
      if (subjectRows.length) await tx.insert(postSubjects).values(subjectRows.map((r) => ({ postId, subjectId: r.id })));
      if (post.type === "event" && eventData) {
        await tx.insert(events).values({ postId, ...eventData }).onConflictDoUpdate({ target: events.postId, set: eventData });
      }
      if (removed.length) await tx.update(storedFiles).set({ deletedAt: now }).where(inArray(storedFiles.id, removed));
      if (files.length) {
        await tx.insert(storedFiles).values(
          files.map((f, i) => ({ ownerId: actor.id, purpose: "attachment" as const, postId, position: firstPosition + i, ...f })),
        );
      }
    });
  } catch (err) {
    await storage()
      .delete(files.map((f) => f.storagePath))
      .catch(() => {});
    throw err;
  }
  return { status };
}

/** The admin can hide a post (members no longer see it) or show it again, without changing it. */
export async function setPostHidden(actor: Actor, postId: string, hidden: boolean): Promise<void> {
  if (!actor.isAdmin) throw new ForbiddenError();
  const post = await loadPost(postId);
  await db.update(posts).set({ hiddenByReports: hidden, updatedAt: new Date() }).where(eq(posts.id, postId));
  await audit(actor, hidden ? "post.hide" : "post.unhide", { type: "post", id: postId }, null, { title: post.title });
  if (hidden && post.authorId !== actor.id) {
    await notify([post.authorId], {
      kind: "decision",
      title: `Your post "${post.title}" was hidden`,
      body: "The admin hid this post while it is reviewed. Use the contact page if you think this is a mistake.",
      link: `/posts/${postId}`,
    });
  }
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

/** Upvote (1), downvote (-1) or clear (0) the viewer's vote. Returns the post's new score. */
export async function votePost(actor: Actor, postId: string, value: VoteValue | 0): Promise<number> {
  const post = await loadPost(postId);
  if (!canInteract(actor, post)) throw new NotFoundError();
  if (post.authorId === actor.id) throw new AppError("You can't vote on your own post.");
  await enforce("vote", actor.id, LIMITS.votePerUser.limit, LIMITS.votePerUser.window);
  if (value === 0) {
    await db.delete(postVotes).where(and(eq(postVotes.postId, postId), eq(postVotes.userId, actor.id)));
  } else {
    await db
      .insert(postVotes)
      .values({ postId, userId: actor.id, value })
      .onConflictDoUpdate({ target: [postVotes.postId, postVotes.userId], set: { value } });
  }
  const [row] = await db
    .update(posts)
    .set({ score: sql`(select coalesce(sum(value), 0)::int from post_votes where post_id = ${postId})` })
    .where(eq(posts.id, postId))
    .returning({ score: posts.score });
  return row?.score ?? 0;
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
