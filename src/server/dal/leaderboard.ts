import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { posts, users } from "@/db/schema";
import type { Actor } from "../actor-types";

// Contributor leaderboard: opt-in, ranked by helpful votes on approved posts.
export async function leaderboard(limit = 50) {
  const helpful = sql<number>`coalesce(sum(${posts.helpfulCount}), 0)::int`;
  return db
    .select({ userId: users.id, username: users.username, name: users.displayName, helpful, posts: sql<number>`count(${posts.id})::int` })
    .from(users)
    .innerJoin(
      posts,
      and(
        eq(posts.authorId, users.id),
        eq(posts.status, "approved"),
        eq(posts.hiddenByReports, false),
        isNull(posts.deletedAt),
        // Anonymous posts would otherwise give away who wrote them.
        eq(posts.anonymous, false),
      ),
    )
    .where(and(eq(users.showOnLeaderboard, true), eq(users.status, "active"), eq(users.hiddenByReports, false)))
    .groupBy(users.id)
    .having(sql`sum(${posts.helpfulCount}) > 0`)
    .orderBy(desc(helpful), asc(users.username))
    .limit(limit);
}

export async function setLeaderboardOptIn(actor: Actor, show: boolean) {
  await db.update(users).set({ showOnLeaderboard: show }).where(eq(users.id, actor.id));
}
