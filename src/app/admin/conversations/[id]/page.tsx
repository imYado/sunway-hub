import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDateTime } from "@/lib/dates";
import { requireAdminPage } from "@/server/actor";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { getConversationForAdmin } from "@/server/dal/messages";

export const metadata: Metadata = { title: "Reported conversation" };

function Person({ label, p }: { label: string; p: { id: string; email: string; username: string | null; name: string | null; status: string } }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd>
        <Link href={`/admin/users/${p.id}`}>{p.name ?? "(no name)"}</Link>
        {p.username && ` @${p.username}`}
        <span className="block break-all">{p.email}</span>
        {p.status !== "active" && <span className="badge">{p.status}</span>}
      </dd>
    </div>
  );
}

export default async function AdminConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage();
  const { id } = await params;
  let c;
  try {
    c = await getConversationForAdmin(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ForbiddenError) notFound();
    throw err;
  }
  const nameOf = (senderId: string) => (senderId === c.starter.id ? (c.starter.name ?? "Starter") : (c.recipient.name ?? "Recipient"));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Reported conversation</h1>
        <p className="text-sm text-muted">
          You can see this because a message in it was reported. This view is recorded in the audit log.
        </p>
      </div>
      <dl className="card grid gap-4 p-4 text-sm sm:grid-cols-2">
        <Person label="Started by" p={c.starter} />
        <Person label={c.recipientAnonymous ? `Sent to (anonymous poster${c.recipientRevealed ? ", name shown" : ", name hidden from starter"})` : "Sent to"} p={c.recipient} />
        <div>
          <dt className="text-muted">Status</dt>
          <dd>{c.status}</dd>
        </div>
        {c.postTitle && (
          <div>
            <dt className="text-muted">About</dt>
            <dd>{c.postId ? <Link href={`/posts/${c.postId}`}>{c.postTitle}</Link> : c.postTitle}</dd>
          </div>
        )}
      </dl>
      <ol className="space-y-3">
        {c.messages.map((m) => (
          <li key={m.id} className={`card p-3 ${c.reportedMessageIds.includes(m.id) ? "border-danger" : ""}`}>
            <p className="mb-1 text-xs text-muted">
              {nameOf(m.senderId)} · {formatDateTime(m.createdAt)}
              {m.deletedAt && ` · removed ${formatDateTime(m.deletedAt)}`}
              {c.reportedMessageIds.includes(m.id) && <span className="badge ml-2 text-danger">Reported</span>}
            </p>
            {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
            {m.files.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {m.files.map((f) => (
                  <li key={f.id}>
                    <a href={`/api/files/dm/${f.id}`} target="_blank" rel="noopener">
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      <p className="text-sm">
        <Link href="/admin/reports">Back to reports</Link> to remove the message, or warn or ban the sender.
      </p>
    </div>
  );
}
