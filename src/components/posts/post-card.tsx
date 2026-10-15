import Link from "next/link";
import { CalendarDays, FileText, Link2, ThumbsUp } from "lucide-react";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { PostCard as PostCardData } from "@/server/dal/posts";

const TYPE_LABEL = { study: "Study Material", event: "Event", club: "Club Post" } as const;

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

export function PostCard({ post, showStatus = false }: { post: PostCardData; showStatus?: boolean }) {
  return (
    <article className="card p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="badge">{TYPE_LABEL[post.type]}</span>
        {post.club && (
          <Link href={`/clubs/${post.club.slug}`} className="text-sm">
            {post.club.name}
          </Link>
        )}
        {showStatus && <StatusBadge status={post.status} />}
        {post.hiddenByReports && <span className="badge text-danger">Hidden while under review</span>}
      </div>
      <h2 className="text-lg font-semibold">
        <Link href={`/posts/${post.id}`} className="text-ink">
          {post.title}
        </Link>
        {post.titleEdited && <span className="ml-2 text-sm font-normal text-muted">(edited)</span>}
      </h2>
      {post.event && (
        <p className="mt-1 flex items-center gap-2 text-sm">
          <CalendarDays size={16} aria-hidden="true" />
          {formatDateTime(post.event.startsAt)} · {post.event.location}
        </p>
      )}
      {post.description && <p className="mt-2 line-clamp-3 text-sm text-muted">{post.description}</p>}
      {showStatus && post.decisionReason && post.status !== "approved" && (
        <p className="mt-2 text-sm text-danger">Admin note: {post.decisionReason}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        <AuthorName author={post.author} />
        <span>{formatDate(post.createdAt)}</span>
        {post.subjects.map((s) => (
          <Link key={s.slug} href={`/subjects/${s.slug}`} className="text-sm">
            {s.name}
          </Link>
        ))}
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
        <span className="flex items-center gap-1">
          <ThumbsUp size={14} aria-hidden="true" />
          {post.helpfulCount}
          <span className="sr-only">helpful votes</span>
        </span>
      </div>
    </article>
  );
}

export function PostList({ posts, showStatus = false, empty }: { posts: PostCardData[]; showStatus?: boolean; empty: React.ReactNode }) {
  if (posts.length === 0) return <>{empty}</>;
  return (
    <ul className="space-y-4">
      {posts.map((p) => (
        <li key={p.id}>
          <PostCard post={p} showStatus={showStatus} />
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
