import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { AutoRefresh } from "@/components/messages/auto-refresh";
import { MessageComposer } from "@/components/messages/composer";
import { ChatNotice, PrivacyChatNotice } from "@/components/messages/chat-notice";
import { Avatar } from "@/components/ui/avatar";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
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
  const pendingFromMe = c.status === "pending" && c.role === "starter";
  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <AutoRefresh seconds={15} />
      <header className="mb-2 flex items-center gap-3 border-b border-line pb-3">
        <Link href="/messages" aria-label="Back to messages" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface">
          <ArrowLeft size={22} aria-hidden="true" />
        </Link>
        <Avatar userId={c.other.id ?? ""} name={c.other.name} hasImage={c.other.hasAvatar} anonymous={c.other.anonymous || !c.other.id} decorative size={40} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">
            {c.other.username ? <Link href={`/u/${c.other.username}`}>{c.other.name}</Link> : c.other.name}
          </h1>
          {c.other.username && (
            <p className="truncate text-sm text-muted">
              @{c.other.username}
              {c.friends && " · Friends"}
            </p>
          )}
        </div>
        <details className="relative" data-popup>
          <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-ink hover:bg-surface" aria-label="Conversation options">
            <MoreHorizontal size={22} aria-hidden="true" />
          </summary>
          <div className="absolute right-0 z-40 mt-2 flex w-64 flex-col gap-2 rounded border border-line bg-bg p-3 text-sm shadow-lg">
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
        </details>
      </header>

      <div className="flex-1 py-2">
        {c.postTitle && (
          <ChatNotice title="About a post">{c.postId ? <Link href={`/posts/${c.postId}`}>{c.postTitle}</Link> : c.postTitle}</ChatNotice>
        )}
        {c.iAmHidden && <ChatNotice>You&apos;re anonymous here: they can&apos;t see your name.</ChatNotice>}
        <PrivacyChatNotice />

        <ol className="mt-4 space-y-1" aria-label="Messages">
          {c.messages.map((m, i) => {
            const next = c.messages[i + 1];
            const lastInRun = !next || next.mine !== m.mine;
            return (
              <li key={m.id} id={`m-${m.id}`} className={`flex items-end gap-2 ${m.mine ? "justify-end" : "justify-start"} ${lastInRun ? "mb-3" : ""}`}>
                {!m.mine && (
                  <span className={`shrink-0 ${lastInRun ? "" : "invisible"}`}>
                    <Avatar userId={c.other.id ?? ""} name={c.other.name} hasImage={c.other.hasAvatar} anonymous={c.other.anonymous || !c.other.id} decorative size={28} />
                  </span>
                )}
                <div className={`group flex max-w-[78%] flex-col ${m.mine ? "items-end" : "items-start"}`}>
                  <span className="sr-only">{m.mine ? "You" : c.other.name}:</span>
                  {m.deleted ? (
                    <p className="rounded-[22px] border border-line px-4 py-2 text-sm italic text-muted">Message removed</p>
                  ) : (
                    <>
                      {m.body && (
                        <p className={`whitespace-pre-wrap break-words rounded-[22px] px-4 py-2 ${m.mine ? "bg-ink text-on-ink" : "bg-surface text-ink"}`}>{m.body}</p>
                      )}
                      {m.files.length > 0 && (
                        <div className={`mt-1 flex flex-wrap gap-1 ${m.mine ? "justify-end" : ""}`}>
                          {m.files.map((f) => (
                            <a key={f.id} href={`/api/files/dm/${f.id}`} target="_blank" rel="noopener">
                              {/* eslint-disable-next-line @next/next/no-img-element -- private, decrypted per request */}
                              <img
                                src={`/api/files/dm/${f.id}`}
                                alt={f.name}
                                width={f.width ?? undefined}
                                height={f.height ?? undefined}
                                className="max-h-64 w-auto rounded-[16px] border border-line"
                                loading="lazy"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {lastInRun && <span className="mt-1 px-2 text-xs text-muted">{formatDateTime(m.createdAt)}</span>}
                  {!m.deleted && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {m.mine ? (
                        <ActionForm action={deleteMessageAction} confirm="Remove this message for both of you?">
                          <input type="hidden" name="messageId" value={m.id} />
                          <button type="submit" className="px-2 text-xs text-muted underline-offset-2 hover:underline">
                            Remove
                          </button>
                        </ActionForm>
                      ) : (
                        <ReportForm targetType="message" targetId={m.id} className="text-xs" />
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {pendingForMe && (
          <ChatNotice title={`${c.other.name} wants to message you`}>
            <p>
              {c.iAmHidden
                ? "You posted anonymously. Accepting keeps your name hidden unless you choose to show it."
                : c.friends
                  ? "You're friends. Accept to reply."
                  : "You're not friends. If you accept, you can message each other and send images. They won't know you've seen this unless you accept."}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
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
          </ChatNotice>
        )}
      </div>

      <div className="mt-2">
        {c.canSend ? (
          <MessageComposer conversationId={c.id} userId={actor.id} storageDriver={env.storageDriver} />
        ) : pendingFromMe ? (
          <p className="rounded-[22px] border border-line p-3 text-center text-sm text-muted">Your request was sent. {c.other.name} will only see it if they accept, and you can send more once they do.</p>
        ) : c.status === "declined" ? (
          <p className="rounded-[22px] border border-line p-3 text-center text-sm text-muted">They declined your request.</p>
        ) : c.status === "blocked" ? (
          <p className="rounded-[22px] border border-line p-3 text-center text-sm text-muted">This conversation is blocked.</p>
        ) : null}
      </div>
    </div>
  );
}
