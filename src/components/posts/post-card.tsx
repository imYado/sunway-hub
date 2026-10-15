import Link from "next/link";
import { CalendarDays, FileText, Link2, MessageSquare } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import { POST_TYPE_LABEL } from "@/lib/rules";
import type { PostCard as PostCardData } from "@/server/dal/posts";
import { VoteControl } from "./vote-control";

export function StatusBadge({ status }: { status: PostCardData["status"] }) {
  if (status === "approved") return null;
  const label = { pending: "Pending approval", rejected: "Rejected", changes_requested: "Changes requested" }[status];
  const cls = status === "pending" ? "text-ink" : "text-danger border-danger";
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function AuthorName({ author }: { author: PostCardData["author"] }) {
  if (author.anonymous && !author.id) return <span className="text-muted">Anonymous</span>;
  if (author.deleted || !author.username) return <span className="text-muted">Deleted user</span>;
  return (
    <span>
      <Link href={`/u/${author.username}`}>{author.displayName ?? `@${author.username}`}</Link>
      {author.verifiedTeacher && <span className="badge ml-2">Verified teacher</span>}
      {author.anonymous && <span className="badge ml-2">Shown as Anonymous</span>}
    </span>
  );
}

/** Tags on a post: its subject tags, plus its club as a tag. */
export function PostTags({ post }: { post: Pick<PostCardData, "subjects" | "club"> }) {
  if (post.subjects.length === 0 && !post.club) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Tags">
      {post.club && (
        <li>
          <Link href={`/clubs/${post.club.slug}`} className="badge">
            {post.club.name}
          </Link>
        </li>
      )}
      {post.subjects.map((s) => (
        <li key={s.slug}>
          <Link href={`/subjects/${s.slug}`} className="badge">
            #{s.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function PostCard({ post, showStatus = false, path }: { post: PostCardData; showStatus?: boolean; path?: string }) {
  const votable = post.status === "approved" && !post.hiddenByReports && !post.deletedAt;
  return (
    <article className="card flex gap-3 p-4">
      <VoteControl kind="post" id={post.id} postId={post.id} score={post.score} vote={post.viewerVote} canVote={votable && !post.viewerIsAuthor} path={path} />
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span className="badge">{POST_TYPE_LABEL[post.type]}</span>
          {showStatus && <StatusBadge status={post.status} />}
          {post.hiddenByReports && <span className="badge text-danger">Hidden while under review</span>}
          <AuthorName author={post.author} />
          <span>{formatDate(post.createdAt)}</span>
          {post.editedAt && <span>(edited)</span>}
        </div>
        <h2 className="text-lg font-semibold break-words">
          <Link href={`/posts/${post.id}`} className="text-ink">
            {post.title}
          </Link>
        </h2>
        {post.event && (
          <p className="mt-1 flex items-center gap-2 text-sm">
            <CalendarDays size={16} aria-hidden="true" />
            {formatDateTime(post.event.startsAt)} · {post.event.location}
          </p>
        )}
        {post.description && <p className="mt-2 line-clamp-3 text-sm text-muted break-words">{post.description}</p>}
        {showStatus && post.decisionReason && post.status !== "approved" && (
          <p className="mt-2 text-sm text-danger">Admin note: {post.decisionReason}</p>
        )}
        <div className="mt-3">
          <PostTags post={post} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <Link href={`/posts/${post.id}#comments`} className="flex items-center gap-1 text-muted">
            <MessageSquare size={14} aria-hidden="true" />
            {post.commentCount} comment{post.commentCount === 1 ? "" : "s"}
          </Link>
          {post.semester && <span>{post.semester}</span>}
          {post.fileCount > 0 && (
            <span className="flex items-center gap-1">
              <FileText size={14} aria-hidden="true" />
              {post.fileCount} file{post.fileCount === 1 ? "" : "s"}
            </span>
          )}
          {post.links.length > 0 && (
            <span className="flex items-center gap-1">
              <Link2 size={14} aria-hidden="true" />
              {post.links.length} link{post.links.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export function PostList({ posts, showStatus = false, empty, path }: { posts: PostCardData[]; showStatus?: boolean; empty: React.ReactNode; path?: string }) {
  if (posts.length === 0) return <>{empty}</>;
  return (
    <ul className="space-y-4">
      {posts.map((p) => (
        <li key={p.id}>
          <PostCard post={p} showStatus={showStatus} path={path} />
        </li>
      ))}
    </ul>
  );
}

export function Pagination({ page, pages, makeHref }: { page: number; pages: number; makeHref: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between gap-2">
      {page > 1 ? (
        <Link href={makeHref(page - 1)} className="btn btn-sm">
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={makeHref(page + 1)} className="btn btn-sm">
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
