import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { FriendButton } from "@/components/friend-button";
import { requireMember } from "@/server/actor";
import { listFriendRequests, listFriends, type FriendCard, type FriendState } from "@/server/dal/friends";

export const metadata: Metadata = { title: "Friends" };

function Row({ f, state }: { f: FriendCard; state: FriendState }) {
  const name = f.displayName ?? `@${f.username}`;
  return (
    <li className="flex flex-wrap items-center gap-3 p-3">
      <Link href={`/u/${f.username}`} className="flex min-w-0 flex-1 items-center gap-3 text-ink hover:no-underline">
        <Avatar userId={f.id} name={name} hasImage={f.hasAvatar} decorative size={44} />
        <span className="min-w-0">
          <span className="block truncate font-medium">{name}</span>
          <span className="block truncate text-sm text-muted">@{f.username}</span>
        </span>
      </Link>
      <div className="flex flex-wrap gap-2">
        {state === "friends" && (
          <Link href={`/messages/new?to=${f.username}`} className="btn btn-sm">
            Message
          </Link>
        )}
        <FriendButton userId={f.id} state={state} path="/friends" name={name} />
      </div>
    </li>
  );
}

export default async function FriendsPage() {
  const actor = await requireMember();
  const [friends, requests] = await Promise.all([listFriends(actor), listFriendRequests(actor)]);
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle
        actions={
          <Link href="/search?tab=people" className="btn btn-sm">
            Find people
          </Link>
        }
      >
        Friends
      </PageTitle>
      <p className="mb-6 text-sm text-muted">Friends are mutual: they need to accept your request. Friends can message each other straight away, without a message request.</p>

      {requests.incoming.length > 0 && (
        <section aria-labelledby="incoming" className="mb-8">
          <h2 id="incoming" className="mb-2 text-lg font-semibold">
            Friend requests
          </h2>
          <ul className="divide-y divide-line rounded border border-line">
            {requests.incoming.map((f) => (
              <Row key={f.id} f={f} state="incoming" />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="friends" className="mb-8">
        <h2 id="friends" className="mb-2 text-lg font-semibold">
          Your friends ({friends.length})
        </h2>
        {friends.length === 0 ? (
          <EmptyState title="No friends yet">
            Search for people by their username and tap <strong>Add friend</strong> on their profile.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded border border-line">
            {friends.map((f) => (
              <Row key={f.id} f={f} state="friends" />
            ))}
          </ul>
        )}
      </section>

      {requests.outgoing.length > 0 && (
        <section aria-labelledby="outgoing" className="mb-8">
          <h2 id="outgoing" className="mb-2 text-lg font-semibold">
            Requests you sent
          </h2>
          <ul className="divide-y divide-line rounded border border-line">
            {requests.outgoing.map((f) => (
              <Row key={f.id} f={f} state="outgoing" />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
