import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { formatDateTime } from "@/lib/dates";
import { messageHandledAction } from "@/app/actions/admin";
import { requireAdminPage } from "@/server/actor";
import { listMessages } from "@/server/dal/admin";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const actor = await requireAdminPage();
  const rows = await listMessages(actor);
  return (
    <div>
      <PageTitle>Contact and takedown messages</PageTitle>
      {rows.length === 0 ? (
        <EmptyState title="No messages" />
      ) : (
        <ul className="space-y-3">
          {rows.map((m) => (
            <li key={m.id} className={`card p-4 text-sm ${m.handledAt ? "" : "border-accent"}`}>
              <p className="font-medium">
                {m.kind === "takedown" ? "Takedown request" : "Message"}
                {m.subject ? `: ${m.subject}` : ""} {m.handledAt && <span className="badge ml-2">Handled</span>}
              </p>
              <p className="text-muted">
                {m.name} &lt;{m.email}&gt; · {formatDateTime(m.createdAt)}
              </p>
              {m.contentUrl && <p className="mt-1 break-all">Content: {m.contentUrl}</p>}
              {m.hiddenPostId && (
                <p className="mt-1">
                  Post hidden automatically: <Link href={`/posts/${m.hiddenPostId}`}>review it</Link> (unhide from Content if the request is invalid).
                </p>
              )}
              <p className="mt-2 whitespace-pre-wrap">{m.message}</p>
              {!m.handledAt && (
                <ActionForm action={messageHandledAction} className="mt-2">
                  <input type="hidden" name="id" value={m.id} />
                  <SubmitButton variant="default" size="sm">
                    Mark handled
                  </SubmitButton>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
