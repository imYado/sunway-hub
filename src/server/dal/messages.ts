import "server-only";
import { assertSunwayVerified } from "./verification";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, directMessages, posts, reports, storedFiles, users } from "@/db/schema";
import { decryptText, encryptText } from "@/lib/crypto";
import { env } from "@/lib/env";
import { MAX_FILES_PER_DM } from "@/lib/files";
import { DM_MAX, DM_REQUESTS_PER_DAY, DM_RETRY_AFTER_DAYS } from "@/lib/rules";
import type { Actor } from "../actor-types";
import { audit } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { assertClean } from "../profanity";
import { enforce, LIMITS } from "../rate-limit";
import { storage } from "../storage";
import { notify } from "./notifications";
import { assertAdmin, canInteract } from "./policy";
import { finaliseUploads } from "./uploads";

/**
 * Private messages.
 *
 * - A conversation starts as a request with one text message. The recipient accepts or
 *   declines it; nothing else can be sent until they accept.
 * - Nobody messages anonymously: the recipient always sees who the starter is.
 * - Messaging the poster of an anonymous post keeps the poster hidden from the starter
 *   until the poster chooses to show their name. The starter's view never contains the
 *   poster's id, name or username, and errors never depend on who the poster is.
 * - Text and images are encrypted at rest. The admin can only open a conversation in
 *   which someone has reported a message, and every such view is audited.
 */

type ConversationRow = typeof conversations.$inferSelect;

const bodySchema = z.string().trim().max(DM_MAX, `Messages can be at most ${DM_MAX} characters.`);
const filesSchema = z
  .array(z.object({ pathname: z.string().min(1).max(500), name: z.string().min(1).max(200) }))
  .max(MAX_FILES_PER_DM, `You can send up to ${MAX_FILES_PER_DM} images at a time.`)
  .default([]);

function encrypt(text: string): string {
  return encryptText(env.sessionSecret, text);
}

function decrypt(payload: string): string {
  try {
    return decryptText(env.sessionSecret, payload);
  } catch {
    return "[This message can't be read.]";
  }
}

function isUuid(id: string): boolean {
  return z.string().uuid().safeParse(id).success;
}

async function loadConversation(id: string): Promise<ConversationRow> {
  if (!isUuid(id)) throw new NotFoundError();
  const [c] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!c) throw new NotFoundError();
  return c;
}

/** Participants only. Everyone else (the admin included) gets a 404. */
async function loadOwnConversation(actor: Actor, id: string): Promise<ConversationRow & { role: "starter" | "recipient" }> {
  const c = await loadConversation(id);
  if (c.starterId === actor.id) return { ...c, role: "starter" };
  if (c.recipientId === actor.id) return { ...c, role: "recipient" };
  throw new NotFoundError();
}

/** Whether the starter may see who the recipient is. */
function recipientHidden(c: ConversationRow): boolean {
  return c.recipientAnonymous && !c.recipientRevealed;
}

type UserBits = { id: string; username: string | null; displayName: string | null; status: string };

async function loadUsers(ids: string[]): Promise<Map<string, UserBits>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName, status: users.status })
    .from(users)
    .where(inArray(users.id, [...new Set(ids)]));
  return new Map(rows.map((u) => [u.id, u]));
}

export interface OtherParty {
  /** Null whenever the viewer must not learn who this is. */
  id: string | null;
  /** Null when the viewer must not know who this is (an anonymous poster) or the account is gone. */
  username: string | null;
  name: string;
  anonymous: boolean;
  deleted: boolean;
}

function otherParty(c: ConversationRow, role: "starter" | "recipient", u: UserBits | undefined): OtherParty {
  if (role === "starter" && recipientHidden(c)) return { id: null, username: null, name: "Anonymous poster", anonymous: true, deleted: false };
  if (!u || u.status === "deleted") return { id: null, username: null, name: "Deleted user", anonymous: false, deleted: true };
  return {
    id: u.id,
    username: u.username, name: u.displayName ?? u.username ?? "Member", anonymous: false, deleted: false };
}

function myReadAt(c: ConversationRow, role: "starter" | "recipient"): Date | null {
  return role === "starter" ? c.starterReadAt : c.recipientReadAt;
}

function isUnread(c: ConversationRow, role: "starter" | "recipient", me: string): boolean {
  if (role === "recipient" && c.status === "pending") return true;
  if (!c.lastSenderId || c.lastSenderId === me) return false;
  const read = myReadAt(c, role);
  return !read || c.lastMessageAt > read;
}

// ---------------------------------------------------------------------------
// Starting a conversation
// ---------------------------------------------------------------------------
export const startSchema = z.object({
  to: z.string().trim().toLowerCase().max(40).optional().or(z.literal("").transform(() => undefined)),
  postId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  body: bodySchema.pipe(z.string().min(1, "Write a message.")),
});

/**
 * Sends a message request (or, if the two already talk, a normal message).
 * Returns the conversation id.
 */
export async function startConversation(actor: Actor, raw: z.input<typeof startSchema>): Promise<{ id: string }> {
  const input = startSchema.parse(raw);
  if (!input.to && !input.postId) throw new AppError("Choose who to message.");
  await assertSunwayVerified(actor);

  let recipientId: string;
  let anonymous = false;
  let postId: string | null = null;
  let postTitle: string | null = null;
  if (input.postId) {
    const [p] = await db.select().from(posts).where(eq(posts.id, input.postId)).limit(1);
    if (!p || !canInteract(actor, p)) throw new NotFoundError();
    if (p.authorId === actor.id) throw new AppError("This is your own post.");
    recipientId = p.authorId;
    anonymous = p.anonymous;
    postId = p.id;
    postTitle = p.title;
  } else {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.username, input.to!)).limit(1);
    if (!u) throw new NotFoundError();
    recipientId = u.id;
  }
  if (recipientId === actor.id) throw new AppError("You can't message yourself.");
  const [recipient] = await db.select({ status: users.status, onboardedAt: users.onboardedAt }).from(users).where(eq(users.id, recipientId)).limit(1);
  if (!recipient || recipient.status === "deleted" || recipient.status === "banned" || !recipient.onboardedAt) {
    throw new AppError("This member can't receive messages.");
  }

  // An existing conversation with the same person (named) or about the same anonymous post.
  const [existing] = anonymous
    ? await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.starterId, actor.id),
            eq(conversations.recipientId, recipientId),
            eq(conversations.postId, postId!),
            eq(conversations.recipientAnonymous, true),
          ),
        )
        .limit(1)
    : await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.recipientAnonymous, false),
            or(
              and(eq(conversations.starterId, actor.id), eq(conversations.recipientId, recipientId)),
              and(eq(conversations.starterId, recipientId), eq(conversations.recipientId, actor.id)),
            ),
          ),
        )
        .limit(1);

  if (existing) {
    const iStarted = existing.starterId === actor.id;
    if (existing.status === "accepted") {
      await sendMessage(actor, existing.id, { body: input.body });
      return { id: existing.id };
    }
    if (existing.status === "blocked") {
      throw new AppError(existing.blockedBy === actor.id ? "You blocked this conversation. Unblock it in Messages first." : "You can't message this member.");
    }
    if (existing.status === "pending") {
      if (iStarted) throw new AppError("You already sent a request. You can send more once they accept.");
      // They asked to message me first: replying accepts their request.
      await respondToRequest(actor, existing.id, "accept");
      await sendMessage(actor, existing.id, { body: input.body });
      return { id: existing.id };
    }
    // Declined. The person who was declined may ask again after a few days.
    if (iStarted && existing.respondedAt && Date.now() - existing.respondedAt.getTime() < DM_RETRY_AFTER_DAYS * 86_400_000) {
      throw new AppError(`They declined your request. You can try again after ${DM_RETRY_AFTER_DAYS} days.`);
    }
  }

  await enforce("dm-request", actor.id, DM_REQUESTS_PER_DAY, 86_400);
  // Requests reach people who haven't agreed to talk yet, so they go through the word filter.
  await assertClean(input.body);
  const now = new Date();
  const id = await db.transaction(async (tx) => {
    let convId: string;
    if (existing) {
      convId = existing.id;
      await tx
        .update(conversations)
        .set({
          starterId: actor.id,
          recipientId,
          status: "pending",
          respondedAt: null,
          blockedBy: null,
          lastMessageAt: now,
          lastSenderId: actor.id,
          starterReadAt: now,
          recipientReadAt: null,
          ...(postId ? { postId, postTitle } : {}),
        })
        .where(eq(conversations.id, convId));
    } else {
      const [row] = await tx
        .insert(conversations)
        .values({
          starterId: actor.id,
          recipientId,
          postId,
          postTitle,
          recipientAnonymous: anonymous,
          lastMessageAt: now,
          lastSenderId: actor.id,
          starterReadAt: now,
        })
        .returning({ id: conversations.id });
      convId = row.id;
    }
    await tx.insert(directMessages).values({ conversationId: convId, senderId: actor.id, bodyEnc: encrypt(input.body), createdAt: now });
    return convId;
  });
  const starterName = actor.displayName ?? (actor.username ? `@${actor.username}` : "A member");
  await notify([recipientId], {
    kind: "message",
    title: anonymous ? `${starterName} wants to message you about your anonymous post "${postTitle}"` : `${starterName} sent you a message request`,
    link: `/messages/${id}`,
  });
  return { id };
}

// ---------------------------------------------------------------------------
// Responding, revealing and blocking
// ---------------------------------------------------------------------------
export async function respondToRequest(actor: Actor, conversationId: string, action: "accept" | "accept_reveal" | "decline"): Promise<void> {
  const c = await loadOwnConversation(actor, conversationId);
  if (c.role !== "recipient" || c.status !== "pending") throw new AppError("There is no request to answer here.");
  const accept = action !== "decline";
  const reveal = action === "accept_reveal" && c.recipientAnonymous;
  await db
    .update(conversations)
    .set({ status: accept ? "accepted" : "declined", respondedAt: new Date(), recipientReadAt: new Date(), ...(reveal ? { recipientRevealed: true } : {}) })
    .where(eq(conversations.id, c.id));
  if (accept) {
    const hidden = c.recipientAnonymous && !reveal;
    const who = hidden ? `The poster of "${c.postTitle ?? "your post"}"` : (actor.displayName ?? `@${actor.username}`);
    await notify([c.starterId], { kind: "message", title: `${who} accepted your message request`, link: `/messages/${c.id}` });
  }
}

/** The anonymous poster chooses to show their name in this conversation. It can't be undone. */
export async function revealIdentity(actor: Actor, conversationId: string): Promise<void> {
  const c = await loadOwnConversation(actor, conversationId);
  if (c.role !== "recipient" || !c.recipientAnonymous) throw new AppError("Your name is already shown here.");
  if (c.recipientRevealed) return;
  await db.update(conversations).set({ recipientRevealed: true }).where(eq(conversations.id, c.id));
}

export async function setBlocked(actor: Actor, conversationId: string, blocked: boolean): Promise<void> {
  const c = await loadOwnConversation(actor, conversationId);
  if (blocked) {
    if (c.status === "blocked") return;
    await db.update(conversations).set({ status: "blocked", blockedBy: actor.id }).where(eq(conversations.id, c.id));
  } else {
    if (c.status !== "blocked" || c.blockedBy !== actor.id) throw new AppError("Only the person who blocked this conversation can unblock it.");
    await db
      .update(conversations)
      .set({ status: c.respondedAt ? "accepted" : "pending", blockedBy: null })
      .where(eq(conversations.id, c.id));
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
export const sendSchema = z.object({ body: bodySchema.default(""), files: filesSchema });

export async function sendMessage(actor: Actor, conversationId: string, raw: z.input<typeof sendSchema>): Promise<{ id: string }> {
  const input = sendSchema.parse(raw);
  if (!input.body && input.files.length === 0) throw new AppError("Write a message or add an image.");
  const c = await loadOwnConversation(actor, conversationId);
  if (c.status === "pending") {
    throw new AppError(c.role === "starter" ? "You can send more once they accept your request." : "Accept the request to reply.");
  }
  if (c.status !== "accepted") throw new AppError("This conversation is closed.");
  const otherId = c.role === "starter" ? c.recipientId : c.starterId;
  const [other] = await db.select({ status: users.status }).from(users).where(eq(users.id, otherId)).limit(1);
  if (!other || other.status === "deleted" || other.status === "banned") throw new AppError("This member can't receive messages anymore.");
  await enforce("dm", actor.id, LIMITS.dmPerUser.limit, LIMITS.dmPerUser.window);

  const id = crypto.randomUUID();
  const files = await finaliseUploads(actor, c.id, input.files, { dm: true, folder: `dm/${c.id}/${id}` });
  const now = new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(directMessages).values({ id, conversationId: c.id, senderId: actor.id, bodyEnc: encrypt(input.body), createdAt: now });
      if (files.length) {
        await tx
          .insert(storedFiles)
          .values(files.map((f, i) => ({ ownerId: actor.id, purpose: "dm_image" as const, messageId: id, position: i, encrypted: true, ...f })));
      }
      await tx
        .update(conversations)
        .set({ lastMessageAt: now, lastSenderId: actor.id, ...(c.role === "starter" ? { starterReadAt: now } : { recipientReadAt: now }) })
        .where(eq(conversations.id, c.id));
    });
  } catch (err) {
    await storage()
      .delete(files.map((f) => f.storagePath))
      .catch(() => {});
    throw err;
  }
  return { id };
}

/**
 * The sender removes their message for both people. The encrypted copy is kept for
 * 30 days so a report about it can still be checked, then erased by the daily job.
 */
export async function deleteMessage(actor: Actor, messageId: string, reason?: string): Promise<{ conversationId: string }> {
  if (!isUuid(messageId)) throw new NotFoundError();
  const [m] = await db.select().from(directMessages).where(eq(directMessages.id, messageId)).limit(1);
  if (!m) throw new NotFoundError();
  if (m.senderId !== actor.id && !actor.isAdmin) throw new NotFoundError();
  if (m.deletedAt) return { conversationId: m.conversationId };
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(directMessages).set({ deletedAt: now }).where(eq(directMessages.id, messageId));
    await tx.update(storedFiles).set({ deletedAt: now }).where(and(eq(storedFiles.messageId, messageId), isNull(storedFiles.deletedAt)));
  });
  if (m.senderId !== actor.id) {
    await audit(actor, "dm.delete_by_admin", { type: "message", id: messageId }, reason ?? null);
    await notify([m.senderId], { kind: "decision", title: "A message you sent was removed", body: reason ? `Reason: ${reason}` : null, link: `/messages/${m.conversationId}` });
  }
  return { conversationId: m.conversationId };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------
export interface ConversationSummary {
  id: string;
  other: OtherParty;
  postTitle: string | null;
  status: ConversationRow["status"];
  role: "starter" | "recipient";
  preview: string;
  lastMessageAt: Date;
  unread: boolean;
}

export async function listConversations(actor: Actor): Promise<{ requests: ConversationSummary[]; chats: ConversationSummary[] }> {
  const rows = await db
    .select()
    .from(conversations)
    .where(
      or(
        eq(conversations.starterId, actor.id),
        // Declined requests disappear for the recipient.
        and(eq(conversations.recipientId, actor.id), ne(conversations.status, "declined")),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(200);
  const people = await loadUsers(rows.map((c) => (c.starterId === actor.id ? c.recipientId : c.starterId)));
  const ids = rows.map((c) => c.id);
  const last = ids.length
    ? await db
        .selectDistinctOn([directMessages.conversationId], {
          conversationId: directMessages.conversationId,
          bodyEnc: directMessages.bodyEnc,
          deletedAt: directMessages.deletedAt,
          senderId: directMessages.senderId,
        })
        .from(directMessages)
        .where(inArray(directMessages.conversationId, ids))
        .orderBy(directMessages.conversationId, desc(directMessages.createdAt))
    : [];
  const requests: ConversationSummary[] = [];
  const chats: ConversationSummary[] = [];
  for (const c of rows) {
    const role = c.starterId === actor.id ? "starter" : "recipient";
    const other = otherParty(c, role, people.get(role === "starter" ? c.recipientId : c.starterId));
    const l = last.find((m) => m.conversationId === c.id);
    const text = !l ? "" : l.deletedAt ? "Message removed" : decrypt(l.bodyEnc) || "Image";
    const summary: ConversationSummary = {
      id: c.id,
      other,
      postTitle: c.postTitle,
      status: c.status,
      role,
      preview: (l?.senderId === actor.id ? `You: ${text}` : text).slice(0, 90),
      lastMessageAt: c.lastMessageAt,
      unread: isUnread(c, role, actor.id),
    };
    if (role === "recipient" && c.status === "pending") requests.push(summary);
    else chats.push(summary);
  }
  return { requests, chats };
}

/** Conversations with something new for the header badge: unread messages and requests. */
export async function unreadMessageCount(actor: Actor): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(conversations)
    .where(
      or(
        and(eq(conversations.recipientId, actor.id), eq(conversations.status, "pending")),
        and(
          eq(conversations.status, "accepted"),
          ne(conversations.lastSenderId, actor.id),
          or(
            and(eq(conversations.starterId, actor.id), sql`(${conversations.starterReadAt} is null or ${conversations.lastMessageAt} > ${conversations.starterReadAt})`),
            and(eq(conversations.recipientId, actor.id), sql`(${conversations.recipientReadAt} is null or ${conversations.lastMessageAt} > ${conversations.recipientReadAt})`),
          ),
        ),
      ),
    );
  return Number(r?.n ?? 0);
}

export interface MessageView {
  id: string;
  mine: boolean;
  body: string;
  createdAt: Date;
  deleted: boolean;
  files: { id: string; name: string; width: number | null; height: number | null }[];
}

export interface ConversationView {
  id: string;
  role: "starter" | "recipient";
  status: ConversationRow["status"];
  other: OtherParty;
  postId: string | null;
  postTitle: string | null;
  /** True when I'm the anonymous poster and the other person can't see my name. */
  iAmHidden: boolean;
  blockedByMe: boolean;
  messages: MessageView[];
  canSend: boolean;
}

async function messageFiles(messageIds: string[], includeDeleted: boolean) {
  if (messageIds.length === 0) return [];
  return db
    .select({ id: storedFiles.id, messageId: storedFiles.messageId, name: storedFiles.originalName, width: storedFiles.width, height: storedFiles.height })
    .from(storedFiles)
    .where(and(inArray(storedFiles.messageId, messageIds), includeDeleted ? undefined : isNull(storedFiles.deletedAt)))
    .orderBy(asc(storedFiles.position));
}

export async function getConversation(actor: Actor, conversationId: string): Promise<ConversationView> {
  const c = await loadOwnConversation(actor, conversationId);
  // The person who declined a request no longer sees it.
  if (c.role === "recipient" && c.status === "declined") throw new NotFoundError();
  const otherId = c.role === "starter" ? c.recipientId : c.starterId;
  const people = await loadUsers([otherId]);
  const rows = await db
    .select()
    .from(directMessages)
    .where(eq(directMessages.conversationId, c.id))
    .orderBy(desc(directMessages.createdAt))
    .limit(300);
  rows.reverse();
  const files = await messageFiles(
    rows.filter((m) => !m.deletedAt).map((m) => m.id),
    false,
  );
  await db
    .update(conversations)
    .set(c.role === "starter" ? { starterReadAt: new Date() } : { recipientReadAt: new Date() })
    .where(eq(conversations.id, c.id));
  return {
    id: c.id,
    role: c.role,
    status: c.status,
    other: otherParty(c, c.role, people.get(otherId)),
    postId: c.postId,
    postTitle: c.postTitle,
    iAmHidden: c.role === "recipient" && recipientHidden(c),
    blockedByMe: c.status === "blocked" && c.blockedBy === actor.id,
    canSend: c.status === "accepted",
    messages: rows.map((m) => ({
      id: m.id,
      mine: m.senderId === actor.id,
      body: m.deletedAt ? "" : decrypt(m.bodyEnc),
      createdAt: m.createdAt,
      deleted: !!m.deletedAt,
      files: m.deletedAt ? [] : files.filter((f) => f.messageId === m.id).map((f) => ({ id: f.id, name: f.name, width: f.width, height: f.height })),
    })),
  };
}

/** Whether anyone has reported a message in this conversation (which lets the admin read it). */
async function conversationReported(conversationId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: reports.id })
    .from(reports)
    .innerJoin(directMessages, eq(directMessages.id, reports.targetId))
    .where(and(eq(reports.targetType, "message"), eq(directMessages.conversationId, conversationId)))
    .limit(1);
  return !!r;
}

/** Used by the image route: participants, or the admin for a reported conversation. */
export async function getDmFileForViewer(actor: Actor, fileId: string) {
  if (!isUuid(fileId)) return null;
  const [f] = await db.select().from(storedFiles).where(eq(storedFiles.id, fileId)).limit(1);
  if (!f || f.purpose !== "dm_image" || !f.messageId) return null;
  const [m] = await db.select().from(directMessages).where(eq(directMessages.id, f.messageId)).limit(1);
  if (!m) return null;
  const c = await loadConversation(m.conversationId).catch(() => null);
  if (!c) return null;
  const participant = c.starterId === actor.id || c.recipientId === actor.id;
  if (participant && !f.deletedAt && !m.deletedAt && !(c.recipientId === actor.id && c.status === "declined")) return f;
  if (actor.isAdmin && (await conversationReported(c.id))) return f;
  return null;
}

// ---------------------------------------------------------------------------
// Reports and the admin
// ---------------------------------------------------------------------------
export async function describeMessage(messageId: string) {
  if (!isUuid(messageId)) return null;
  const [m] = await db
    .select({ id: directMessages.id, conversationId: directMessages.conversationId, senderId: directMessages.senderId, bodyEnc: directMessages.bodyEnc, deletedAt: directMessages.deletedAt })
    .from(directMessages)
    .where(eq(directMessages.id, messageId))
    .limit(1);
  if (!m) return null;
  const [c] = await db.select().from(conversations).where(eq(conversations.id, m.conversationId)).limit(1);
  if (!c) return null;
  return { id: m.id, conversationId: m.conversationId, senderId: m.senderId, deletedAt: m.deletedAt, starterId: c.starterId, recipientId: c.recipientId, preview: decrypt(m.bodyEnc).slice(0, 80) };
}

export interface AdminConversationView {
  id: string;
  status: ConversationRow["status"];
  postId: string | null;
  postTitle: string | null;
  recipientAnonymous: boolean;
  recipientRevealed: boolean;
  starter: { id: string; email: string; username: string | null; name: string | null; status: string };
  recipient: { id: string; email: string; username: string | null; name: string | null; status: string };
  reportedMessageIds: string[];
  messages: { id: string; senderId: string; body: string; createdAt: Date; deletedAt: Date | null; files: { id: string; name: string }[] }[];
}

/** The admin reads a conversation only once a message in it has been reported. Audited. */
export async function getConversationForAdmin(actor: Actor, conversationId: string): Promise<AdminConversationView> {
  assertAdmin(actor);
  const c = await loadConversation(conversationId);
  if (!(await conversationReported(c.id))) throw new ForbiddenError("Conversations can only be opened when a message in them has been reported.");
  const { identityForAdmin } = await import("./users");
  const [starter, recipient] = await Promise.all([identityForAdmin(c.starterId), identityForAdmin(c.recipientId)]);
  const rows = await db.select().from(directMessages).where(eq(directMessages.conversationId, c.id)).orderBy(asc(directMessages.createdAt)).limit(1000);
  const files = await messageFiles(
    rows.map((m) => m.id),
    true,
  );
  const reported = await db
    .select({ id: reports.targetId })
    .from(reports)
    .innerJoin(directMessages, eq(directMessages.id, reports.targetId))
    .where(and(eq(reports.targetType, "message"), eq(directMessages.conversationId, c.id)));
  await audit(actor, "dm.view_reported", { type: "conversation", id: c.id }, null);
  return {
    id: c.id,
    status: c.status,
    postId: c.postId,
    postTitle: c.postTitle,
    recipientAnonymous: c.recipientAnonymous,
    recipientRevealed: c.recipientRevealed,
    starter,
    recipient,
    reportedMessageIds: [...new Set(reported.map((r) => r.id))],
    messages: rows.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      body: decrypt(m.bodyEnc),
      createdAt: m.createdAt,
      deletedAt: m.deletedAt,
      files: files.filter((f) => f.messageId === m.id).map((f) => ({ id: f.id, name: f.name })),
    })),
  };
}

/** For the data export: my conversations, without the ids of anyone else. */
export async function myMessagesForExport(actor: Actor) {
  const rows = await db
    .select()
    .from(conversations)
    .where(or(eq(conversations.starterId, actor.id), eq(conversations.recipientId, actor.id)));
  const out = [];
  for (const c of rows) {
    const msgs = await db
      .select()
      .from(directMessages)
      .where(and(eq(directMessages.conversationId, c.id), isNull(directMessages.deletedAt)))
      .orderBy(asc(directMessages.createdAt));
    out.push({
      conversationId: c.id,
      status: c.status,
      aboutPost: c.postTitle,
      startedByMe: c.starterId === actor.id,
      createdAt: c.createdAt,
      messages: msgs.map((m) => ({ from: m.senderId === actor.id ? "me" : "them", text: decrypt(m.bodyEnc), sentAt: m.createdAt })),
    });
  }
  return out;
}
