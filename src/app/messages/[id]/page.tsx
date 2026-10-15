import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { AutoRefresh } from "@/components/messages/auto-refresh";
import { MessageComposer } from "@/components/messages/composer";
import { ReportForm } from "@/components/report-form";
import { formatDateTime } from "@/lib/dates";
import { env } from "@/lib/env";
import { conversationAction, deleteMessageAction, respondAction } from "@/app/actions/messages";
import { requireMember } from "@/server/actor";
import { NotFoundError } from "@/server/errors";
import { getConversation } from "@/server/dal/messages";

export const metadata: Metadata = { title: "Conversation" };

function Op({ id, op, label, variant = "default", confirm }: { id: string; op: string; label: string; variant?: "default" | "primary" | "danger"; confirm?: string }) {
  return (
    <ActionForm action={conversationAction} confirm={confirm}>
      <input type="hidden" name="conversationId" value={id} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton variant={variant} size="sm">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireMember();
  const { id } = await params;
  let c;
  try {
    c = await getConversation(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const pendingForMe = c.status === "pending" && c.role === "recipient";
  return (
    <div className="mx-auto max-w-2xl">
      <AutoRefresh seconds={15} />
      <p className="mb-2 text-sm">
        <Link href="/messages">Back to messages</Link>
      </p>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">
            {c.other.username ? <Link href={`/u/${c.other.username}`}>{c.other.name}</Link> : c.other.name}
          </h1>
          {c.postTitle && (
            <p className="text-sm text-muted">
              About {c.postId ? <Link href={`/posts/${c.postId}`}>{c.postTitle}</Link> : c.postTitle}
            </p>
          )}
          {c.iAmHidden && <p className="text-sm text-muted">You&apos;re anonymous here: they can&apos;t see your name.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {c.iAmHidden && c.status === "accepted" && (
            <Op id={c.id} op="reveal" label="Show my name" confirm="They will see your name and profile. This can't be undone." />
          )}
          {c.status === "blocked" ? (
            c.blockedByMe && <Op id={c.id} op="unblock" label="Unblock" />
          ) : (
            c.status !== "declined" && <Op id={c.id} op="block" label="Block" variant="danger" confirm="Block this conversation? Neither of you can send messages until you unblock it." />
          )}
          {c.other.id && <ReportForm targetType="user" targetId={c.other.id} className="" label="Report person" />}
        </div>
      </div>

      {pendingForMe && (
        <div className="surface mb-4 p-4">
          <p className="font-medium">{c.other.name} wants to message you.</p>
          <p className="mb-3 text-sm text-muted">
            {c.iAmHidden
              ? "You posted anonymously. Accepting keeps your name hidden unless you choose to show it."
              : "If you accept, you can message each other and send images."}
          </p>
          <div className="flex flex-wrap gap-2">
            {(["accept", ...(c.iAmHidden ? ["accept_reveal"] : []), "decline"] as const).map((op) => (
              <ActionForm key={op} action={respondAction}>
                <input type="hidden" name="conversationId" value={c.id} />
                <input type="hidden" name="op" value={op} />
                <SubmitButton variant={op === "decline" ? "danger" : "primary"} size="sm">
                  {op === "accept" ? (c.iAmHidden ? "Accept and stay anonymous" : "Accept") : op === "accept_reveal" ? "Accept and show my name" : "Decline"}
                </SubmitButton>
              </ActionForm>
            ))}
          </div>
        </div>
      )}

      <ol className="space-y-3" aria-label="Messages">
        {c.messages.map((m) => (
          <li key={m.id} id={`m-${m.id}`} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded border border-line p-3 ${m.mine ? "bg-surface" : "bg-bg"}`}>
              <p className="mb-1 text-xs text-muted">
                {m.mine ? "You" : c.other.name} · {formatDateTime(m.createdAt)}
              </p>
              {m.deleted ? (
                <p className="text-sm italic text-muted">Message removed</p>
              ) : (
                <>
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  {m.files.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.files.map((f) => (
                        <a key={f.id} href={`/api/files/dm/${f.id}`} target="_blank" rel="noopener">
                          {/* eslint-disable-next-line @next/next/no-img-element -- private, decrypted per request */}
                          <img
                            src={`/api/files/dm/${f.id}`}
                            alt={f.name}
                            width={f.width ?? undefined}
                            height={f.height ?? undefined}
                            className="max-h-64 w-auto rounded border border-line"
                            loading="lazy"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.mine ? (
                      <ActionForm action={deleteMessageAction} confirm="Remove this message for both of you?">
                        <input type="hidden" name="messageId" value={m.id} />
                        <SubmitButton size="sm">Remove</SubmitButton>
                      </ActionForm>
                    ) : (
                      <ReportForm targetType="message" targetId={m.id} className="" />
                    )}
                  </div>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6">
        {c.canSend ? (
          <MessageComposer conversationId={c.id} userId={actor.id} storageDriver={env.storageDriver} />
        ) : c.status === "pending" && c.role === "starter" ? (
          <p className="surface p-3 text-sm text-muted">Your request was sent. You can send more once they accept.</p>
        ) : c.status === "declined" ? (
          <p className="surface p-3 text-sm text-muted">They declined your request.</p>
        ) : c.status === "blocked" ? (
          <p className="surface p-3 text-sm text-muted">This conversation is blocked.</p>
        ) : null}
      </div>
    </div>
  );
}
