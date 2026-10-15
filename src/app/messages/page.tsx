import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { formatDateTime } from "@/lib/dates";
import { requireMember } from "@/server/actor";
import { listConversations, type ConversationSummary } from "@/server/dal/messages";

export const metadata: Metadata = { title: "Messages" };

function Row({ c }: { c: ConversationSummary }) {
  return (
    <li>
      <Link href={`/messages/${c.id}`} className="card block p-3 text-ink hover:no-underline hover:bg-surface">
        <div className="flex flex-wrap items-center gap-2">
          <span className={c.unread ? "font-semibold" : "font-medium"}>{c.other.name}</span>
          {c.unread && <span className="badge">New</span>}
          {c.status === "pending" && c.role === "starter" && <span className="badge">Waiting for them to accept</span>}
          {c.status === "declined" && <span className="badge">Declined</span>}
          {c.status === "blocked" && <span className="badge text-danger">Blocked</span>}
          <span className="ml-auto text-sm text-muted">{formatDateTime(c.lastMessageAt)}</span>
        </div>
        {c.postTitle && <p className="text-sm text-muted">About: {c.postTitle}</p>}
        {c.preview && <p className="mt-1 truncate text-sm text-muted">{c.preview}</p>}
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
          <ul className="space-y-2">
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
          <EmptyState title="No conversations yet">Use the Message button on someone&apos;s profile or post to start one.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {chats.map((c) => (
              <Row key={c.id} c={c} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
