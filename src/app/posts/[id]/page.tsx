import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark, CalendarPlus, Download, Eye, EyeOff, MessageCircle, Pencil } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CleanTextarea } from "@/components/ui/clean-input";
import { CommentComposer } from "@/components/comments/comment-composer";
import { CommentThread } from "@/components/comments/comment-thread";
import { VoteControl } from "@/components/posts/vote-control";
import { CopyLinkButton } from "@/components/ui/copy-link";
import { AuthorName, PostTags, StatusBadge } from "@/components/posts/post-card";
import { PostLinks } from "@/components/posts/post-links";
import { ReportForm } from "@/components/report-form";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatBytes } from "@/lib/files";
import { MARKET_KIND_LABEL, POST_TYPE_LABEL } from "@/lib/rules";
import { env } from "@/lib/env";
import { bookmarkAction, deletePostAction, hidePostAction, rsvpAction } from "@/app/actions/posts";
import { requireMember } from "@/server/actor";
import { NotFoundError } from "@/server/errors";
import { listComments } from "@/server/dal/comments";
import { getPostDetail, type PostDetail } from "@/server/dal/posts";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Post" };

async function load(id: string): Promise<PostDetail> {
  const actor = await requireMember({ guestOk: true });
  try {
    return await getPostDetail(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await load(id);
  const v = post.viewer;
  const actor = await requireMember({ guestOk: true });
  const [comments, settings] = await Promise.all([listComments(actor, post.id), getSettings()]);
  const ctx = { postId: post.id, userId: actor.id, storageDriver: env.storageDriver, enabledKinds: settings.enabledFileKinds };
  const images = post.files.filter((f) => f.kind === "image");
  const others = post.files.filter((f) => f.kind !== "image");

  return (
    <article className="mx-auto max-w-3xl">
      {post.deletedAt && (
        <p className="surface mb-4 p-3 text-sm text-danger">This post was deleted on {formatDate(post.deletedAt)} and will be purged after 30 days.</p>
      )}
      {(v.isOwner || v.isAdmin) && post.status !== "approved" && (
        <div className="surface mb-4 p-3 text-sm">
          <StatusBadge status={post.status} />
          <p className="mt-2">
            {post.status === "pending" && "Only you and the admin can see this post until it is approved."}
            {post.status === "rejected" && "This post was not approved."}
            {post.status === "changes_requested" && "The admin asked for changes. Edit the post and save it to send it back for approval."}
          </p>
          {post.decisionReason && <p className="mt-2">Admin note: {post.decisionReason}</p>}
        </div>
      )}
      {post.hiddenByReports && (v.isOwner || v.isAdmin) && (
        <p className="surface mb-4 p-3 text-sm text-danger">This post is hidden while the admin reviews reports about it.</p>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="badge">
          {POST_TYPE_LABEL[post.type]}
          {post.marketKind && ` · ${MARKET_KIND_LABEL[post.marketKind]}`}
        </span>
      </div>
      <div className="flex gap-3">
        <VoteControl kind="post" id={post.id} postId={post.id} score={post.score} vote={post.viewerVote} canVote={v.canInteract && !v.isOwner} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold break-words">{post.title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <AuthorName author={post.author} />
            <span>{formatDate(post.createdAt)}</span>
            {post.editedAt && <span>(edited {formatDate(post.editedAt)})</span>}
            {post.semester && <span>{post.semester}</span>}
          </div>
          <div className="mt-3">
            <PostTags post={post} />
          </div>
        </div>
      </div>

      {post.event && (
        <section aria-label="Event details" className="surface mt-4 p-4">
          <p className="font-medium">
            {formatDateTime(post.event.startsAt)}
            {post.event.endsAt && ` to ${formatDateTime(post.event.endsAt)}`}
          </p>
          <p className="text-sm">{post.event.location}</p>
          <p className="mt-1 text-sm text-muted">
            {post.event.going} going{post.event.capacity ? ` of ${post.event.capacity}` : ""} · {post.event.interested} interested
          </p>
          {v.canInteract && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(["going", "interested"] as const).map((s) => (
                <ActionForm key={s} action={rsvpAction}>
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="status" value={v.rsvp === s ? "none" : s} />
                  <SubmitButton variant={v.rsvp === s ? "primary" : "default"} size="sm">
                    {s === "going" ? "Going" : "Interested"}
                    {v.rsvp === s && <span className="sr-only"> (selected, select to remove)</span>}
                  </SubmitButton>
                </ActionForm>
              ))}
              <a href={`/api/events/${post.id}/ics`} className="btn btn-sm">
                <CalendarPlus size={14} aria-hidden="true" /> Add to calendar
              </a>
            </div>
          )}
        </section>
      )}

      {post.description && <p className="mt-4 whitespace-pre-wrap break-words">{post.description}</p>}
      {post.links.length > 0 && <PostLinks links={post.links} className="mt-4" />}

      {images.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {images.map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={f.id}
              src={`/api/files/${f.id}`}
              alt={`Image attached to "${post.title}": ${f.name}`}
              width={f.width ?? undefined}
              height={f.height ?? undefined}
              loading="lazy"
              className="h-auto w-full rounded border border-line"
            />
          ))}
        </div>
      )}
      {others.length > 0 && (
        <ul className="mt-4 space-y-2">
          {others.map((f) =>
            f.kind === "video" ? (
              <li key={f.id}>
                <video controls preload="metadata" className="w-full rounded border border-line" aria-label={`Video: ${f.name}`}>
                  <source src={`/api/files/${f.id}`} type="video/mp4" />
                </video>
                <a href={`/api/files/${f.id}?download=1`} className="mt-1 inline-flex items-center gap-1 text-sm">
                  <Download size={14} aria-hidden="true" /> Download {f.name}
                </a>
              </li>
            ) : (
              <li key={f.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="break-all text-sm">
                  {f.name} <span className="text-muted">({formatBytes(f.size)})</span>
                </span>
                <a href={`/api/files/${f.id}?download=1`} className="btn btn-sm">
                  <Download size={14} aria-hidden="true" /> Download
                </a>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {v.canInteract && !v.isOwner && !post.author.deleted && (
          <Link href={`/messages/new?post=${post.id}`} className={`btn btn-sm ${post.type === "market" ? "btn-primary" : ""}`}>
            <MessageCircle size={14} aria-hidden="true" /> Message {post.author.anonymous ? "the poster" : (post.author.displayName ?? "the poster")}
          </Link>
        )}
        {v.canInteract && (
          <ActionForm action={bookmarkAction}>
            <input type="hidden" name="postId" value={post.id} />
            <SubmitButton variant={v.bookmarked ? "primary" : "default"} size="sm">
              <Bookmark size={14} aria-hidden="true" /> {v.bookmarked ? "Bookmarked" : "Bookmark"}
            </SubmitButton>
          </ActionForm>
        )}
        {v.canInteract && <CopyLinkButton path={`/posts/${post.id}`} />}
        {v.canEdit && (
          <Link href={`/posts/${post.id}/edit`} className="btn btn-sm">
            <Pencil size={14} aria-hidden="true" /> Edit
          </Link>
        )}
        {v.isAdmin && !post.deletedAt && (
          <ActionForm action={hidePostAction}>
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="hidden" value={post.hiddenByReports ? "0" : "1"} />
            <SubmitButton variant="default" size="sm">
              {post.hiddenByReports ? (
                <>
                  <Eye size={14} aria-hidden="true" /> Show post
                </>
              ) : (
                <>
                  <EyeOff size={14} aria-hidden="true" /> Hide post
                </>
              )}
            </SubmitButton>
          </ActionForm>
        )}
      </div>
      {!v.isOwner && !post.deletedAt && !actor.guest && <ReportForm targetType="post" targetId={post.id} />}

      {v.canDelete && (
        <section className="mt-6">
          <ActionForm action={deletePostAction} confirm="Delete this post? It will be hidden immediately and erased after 30 days.">
            <input type="hidden" name="postId" value={post.id} />
            <input type="hidden" name="redirectTo" value={v.isAdmin && !v.isOwner ? "/admin/content" : "/"} />
            {v.isAdmin && !v.isOwner && (
              <div className="mb-2">
                <label htmlFor="delete-reason" className="label">
                  Reason (sent to the poster)
                </label>
                <CleanTextarea id="delete-reason" name="reason" required maxLength={500} rows={2} />
              </div>
            )}
            <SubmitButton variant="danger" size="sm">
              Delete post
            </SubmitButton>
          </ActionForm>
        </section>
      )}

      {v.isAdmin && post.titleHistory.length > 0 && (
        <section className="mt-8 border-t border-line pt-4">
          <h2 className="text-lg font-semibold">Title history (admin only)</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {post.titleHistory.map((h) => (
              <li key={h.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  {formatDateTime(h.editedAt)}: &quot;{h.oldTitle}&quot; to &quot;{h.newTitle}&quot;
                  {h.revertedAt && <span className="text-muted"> (reverted)</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="comments" aria-labelledby="comments-title" className="mt-8 scroll-mt-20 border-t border-line pt-4">
        <h2 id="comments-title" className="text-lg font-semibold">
          Comments ({post.commentCount})
        </h2>
        {v.canInteract ? (
          <CommentComposer ctx={ctx} />
        ) : actor.guest ? (
          <p className="mt-2 text-sm text-muted">
            <Link href="/login">Sign in</Link> to comment.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">Comments open once the post is approved.</p>
        )}
        <CommentThread comments={comments} ctx={ctx} canComment={v.canInteract} isAdmin={v.isAdmin} />
      </section>
    </article>
  );
}
