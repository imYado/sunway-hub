import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { requireMember } from "@/server/actor";
import { leaderboard } from "@/server/dal/leaderboard";
import { getMe } from "@/server/dal/users";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  const actor = await requireMember({ guestOk: true });
  const [rows, me] = await Promise.all([leaderboard(), getMe(actor)]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle>Top contributors</PageTitle>
      <p className="mb-6 text-muted">
        Ranked by the upvotes minus downvotes on their posts. Anonymous posts are not counted. Only members who choose to appear are listed.{" "}
        {me.showOnLeaderboard ? "You're opted in." : "You're not listed."} <Link href="/settings">Change this in Settings</Link>.
      </p>
      {rows.length === 0 ? (
        <EmptyState title="Nobody on the leaderboard yet" />
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {rows.map((r, i) => (
            <li key={r.userId} className="flex items-center gap-4 py-3">
              <span className="w-8 font-display text-lg font-extrabold tabular-nums">{i + 1}</span>
              <Link href={`/u/${r.username}`} className="flex-1 font-medium">
                {r.name ?? `@${r.username}`}
              </Link>
              <span className="text-sm text-muted tabular-nums">
                {r.points} points · {r.posts} {r.posts === 1 ? "post" : "posts"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
