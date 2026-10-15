import "server-only";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { conversations, friendships, userAvatars, users } from "@/db/schema";
import type { Actor } from "../actor-types";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { enforce } from "../rate-limit";
import { notify } from "./notifications";

/**
 * Friends are mutual. One person sends a request and the other accepts it.
 * Either of them can unfriend at any time, which ends it for both.
 */

export type FriendState = "self" | "none" | "outgoing" | "incoming" | "friends";

const FRIEND_REQUESTS_PER_DAY = 40;

function pair(a: string, b: string) {
  return or(
    and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
    and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
  );
}

async function loadPair(a: string, b: string) {
  const [row] = await db.select().from(friendships).where(pair(a, b)).limit(1);
  return row ?? null;
}

function assertMember(actor: Actor) {
  if (actor.guest) throw new ForbiddenError("Sign in to add friends.");
}

async function loadTarget(userId: string) {
  if (!z.string().uuid().safeParse(userId).success) throw new NotFoundError();
  const [u] = await db
    .select({ id: users.id, status: users.status, onboardedAt: users.onboardedAt, username: users.username })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u || u.status === "deleted" || !u.onboardedAt) throw new NotFoundError();
  return u;
}

function who(actor: Actor) {
  return actor.displayName ?? (actor.username ? `@${actor.username}` : "A member");
}

export async function friendState(actor: Actor, otherId: string): Promise<FriendState> {
  if (actor.id === otherId) return "self";
  if (actor.guest) return "none";
  const row = await loadPair(actor.id, otherId);
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requesterId === actor.id ? "outgoing" : "incoming";
}

export async function areFriends(a: string, b: string): Promise<boolean> {
  const row = await loadPair(a, b);
  return row?.status === "accepted";
}

/** A pending message request between two people who just became friends is accepted too. */
async function acceptPendingConversation(a: string, b: string) {
  await db
    .update(conversations)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(
      and(
        eq(conversations.status, "pending"),
        eq(conversations.recipientAnonymous, false),
        or(
          and(eq(conversations.starterId, a), eq(conversations.recipientId, b)),
          and(eq(conversations.starterId, b), eq(conversations.recipientId, a)),
        ),
      ),
    );
}

/** Sends a friend request, or accepts theirs if they already asked. Returns the new state. */
export async function sendFriendRequest(actor: Actor, userId: string): Promise<FriendState> {
  assertMember(actor);
  const target = await loadTarget(userId);
  if (target.id === actor.id) throw new AppError("You can't add yourself.");
  if (target.status === "banned") throw new AppError("You can't add this member.");
  const existing = await loadPair(actor.id, target.id);
  if (existing?.status === "accepted") return "friends";
  if (existing && existing.requesterId === actor.id) return "outgoing";
  if (existing) return respondToFriendRequest(actor, target.id, true);
  await enforce("friend-request", actor.id, FRIEND_REQUESTS_PER_DAY, 86_400);
  await db.insert(friendships).values({ requesterId: actor.id, addresseeId: target.id }).onConflictDoNothing();
  await notify([target.id], { kind: "friend", title: `${who(actor)} sent you a friend request`, link: "/friends" });
  return "outgoing";
}

export async function respondToFriendRequest(actor: Actor, userId: string, accept: boolean): Promise<FriendState> {
  assertMember(actor);
  if (!z.string().uuid().safeParse(userId).success) throw new NotFoundError();
  const [row] = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, actor.id), eq(friendships.status, "pending")))
    .limit(1);
  if (!row) throw new AppError("There is no friend request to answer.");
  if (!accept) {
    await db.delete(friendships).where(and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, actor.id)));
    return "none";
  }
  await db
    .update(friendships)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, actor.id)));
  await acceptPendingConversation(actor.id, userId);
  await notify([userId], { kind: "friend", title: `${who(actor)} accepted your friend request`, link: actor.username ? `/u/${actor.username}` : "/friends" });
  return "friends";
}

/** Cancels my request, or unfriends: either way the link is gone for both people. */
export async function removeFriend(actor: Actor, userId: string): Promise<FriendState> {
  assertMember(actor);
  if (!z.string().uuid().safeParse(userId).success) throw new NotFoundError();
  const row = await loadPair(actor.id, userId);
  if (!row) return "none";
  // Someone else's pending request to me is declined, not cancelled, but ends the same way.
  await db.delete(friendships).where(pair(actor.id, userId));
  return "none";
}

export interface FriendCard {
  id: string;
  username: string;
  displayName: string | null;
  hasAvatar: boolean;
  since: Date;
}

function otherSide(me: string) {
  return sql<string>`case when ${friendships.requesterId} = ${me} then ${friendships.addresseeId} else ${friendships.requesterId} end`;
}

async function cards(me: string, where: ReturnType<typeof and>, dateCol: "createdAt" | "acceptedAt"): Promise<FriendCard[]> {
  const other = otherSide(me);
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      avatar: userAvatars.approvedFileId,
      since: dateCol === "acceptedAt" ? friendships.acceptedAt : friendships.createdAt,
    })
    .from(friendships)
    .innerJoin(users, eq(users.id, other))
    .leftJoin(userAvatars, eq(userAvatars.userId, users.id))
    .where(and(where, eq(users.status, "active")))
    .orderBy(desc(dateCol === "acceptedAt" ? friendships.acceptedAt : friendships.createdAt))
    .limit(500);
  return rows
    .filter((r) => r.username)
    .map((r) => ({ id: r.id, username: r.username as string, displayName: r.displayName, hasAvatar: !!r.avatar, since: r.since ?? new Date() }));
}

export async function listFriends(actor: Actor, userId: string = actor.id): Promise<FriendCard[]> {
  return cards(userId, and(eq(friendships.status, "accepted"), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))), "acceptedAt");
}

export async function listFriendRequests(actor: Actor): Promise<{ incoming: FriendCard[]; outgoing: FriendCard[] }> {
  assertMember(actor);
  const [incoming, outgoing] = await Promise.all([
    cards(actor.id, and(eq(friendships.status, "pending"), eq(friendships.addresseeId, actor.id)), "createdAt"),
    cards(actor.id, and(eq(friendships.status, "pending"), eq(friendships.requesterId, actor.id)), "createdAt"),
  ]);
  return { incoming, outgoing };
}

export async function friendCount(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(friendships)
    .innerJoin(users, eq(users.id, otherSide(userId)))
    .where(and(eq(friendships.status, "accepted"), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)), eq(users.status, "active")));
  return Number(r?.n ?? 0);
}

export async function incomingFriendRequestCount(actor: Actor): Promise<number> {
  if (actor.guest) return 0;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(friendships)
    .where(and(eq(friendships.addresseeId, actor.id), eq(friendships.status, "pending")));
  return Number(r?.n ?? 0);
}
