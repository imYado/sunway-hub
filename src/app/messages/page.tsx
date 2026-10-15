import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { formatDateTime } from "@/lib/dates";
import { Avatar } from "@/components/ui/avatar";
import { requireMember } from "@/server/actor";
import { listConversations, type ConversationSummary } from "@/server/dal/messages";

export const metadata: Metadata = { title: "Messages" };

function Row({ c }: { c: ConversationSummary }) {
  return (
    <li>
      <Link href={`/messages/${c.id}`} className="flex items-center gap-3 rounded px-2 py-3 text-ink hover:bg-surface hover:no-underline">
        <Avatar userId={c.other.id ?? ""} name={c.other.name} hasImage={c.other.hasAvatar} anonymous={c.other.anonymous || !c.other.id} decorative size={52} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={`truncate ${c.unread ? "font-bold" : "font-medium"}`}>{c.other.name}</span>
            {c.status === "pending" && c.role === "starter" && <span className="badge shrink-0 text-xs">Waiting for them to accept</span>}
            {c.status === "declined" && <span className="badge shrink-0 text-xs">Declined</span>}
            {c.status === "blocked" && <span className="badge shrink-0 text-xs text-danger">Blocked</span>}
          </span>
          <span className={`block truncate text-sm ${c.unread ? "font-semibold text-ink" : "text-muted"}`}>
            {c.postTitle && !c.preview ? `About: ${c.postTitle}` : c.preview}
            <span className="text-muted"> · {formatDateTime(c.lastMessageAt)}</span>
          </span>
        </span>
        {c.unread && (
          <>
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink" />
            <span className="sr-only">New</span>
          </>
        )}
      </Link>
    </li>
  );
}

export default async function MessagesPage() {
  const actor = await requireMember();
  const { requests, chats } = await listConversations(actor);
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle>Messages</PageTitle>
      {requests.length > 0 && (
        <section aria-labelledby="requests" className="mb-8">
          <h2 id="requests" className="mb-2 font-semibold">
            Requests ({requests.length})
          </h2>
          <p className="mb-2 text-sm text-muted">People who want to message you. They can&apos;t send anything else until you accept.</p>
          <ul>
            {requests.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="chats">
        <h2 id="chats" className="mb-2 font-semibold">
          Conversations
        </h2>
        {chats.length === 0 ? (
          <EmptyState title="No conversations yet">
            Use the Message button on someone&apos;s profile or post to start one. <Link href="/friends">Your friends</Link> can be messaged straight away.
          </EmptyState>
        ) : (
          <ul>
            {chats.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
