import Link from "next/link";
import { Download } from "lucide-react";
import { ReportForm } from "@/components/report-form";
import { VoteControl } from "@/components/posts/vote-control";
import { formatDateTime } from "@/lib/dates";
import { formatBytes } from "@/lib/files";
import { COMMENT_MAX_DEPTH } from "@/lib/rules";
import type { CommentView } from "@/server/dal/comments";
import type { ComposerContext } from "./comment-composer";
import { CommentTools } from "./comment-tools";

interface Node {
  c: CommentView;
  children: Node[];
}

/** Builds the reply tree. Replies whose parent is missing are shown at the top level. */
export function buildTree(list: CommentView[]): Node[] {
  const nodes = new Map(list.map((c) => [c.id, { c, children: [] as Node[] }]));
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    const parent = n.c.parentId ? nodes.get(n.c.parentId) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  // Best first at every level, like Reddit's default sort; ties go to the older comment.
  const sort = (arr: Node[]) => {
    arr.sort((a, b) => b.c.score - a.c.score || a.c.createdAt.getTime() - b.c.createdAt.getTime());
    arr.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

function CommentAuthor({ c }: { c: CommentView }) {
  if (c.author.anonymous && !c.author.id) return <span className="font-medium">Anonymous (poster)</span>;
  if (!c.author.id) return <span className="text-muted">[deleted]</span>;
  if (c.author.deleted || !c.author.username) return <span className="text-muted">Deleted user</span>;
  return (
    <span>
      <Link href={`/u/${c.author.username}`} className="font-medium">
        {c.author.displayName ?? `@${c.author.username}`}
      </Link>
      {c.author.isPoster && <span className="badge ml-2">Poster</span>}
    </span>
  );
}

function CommentItem({ node, depth, ctx, canComment, isAdmin }: { node: Node; depth: number; ctx: ComposerContext; canComment: boolean; isAdmin: boolean }) {
  const { c } = node;
  // Viewers get an empty body for deleted or hidden comments; the admin (and a hidden comment's author) still sees it.
  const gone = (c.deleted || c.hidden) && !c.body && c.files.length === 0;
  return (
    <li id={`comment-${c.id}`} className="scroll-mt-20">
      <div className="flex gap-2">
        <VoteControl kind="comment" id={c.id} postId={ctx.postId} score={c.score} vote={c.viewer.vote} canVote={c.viewer.canVote} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <CommentAuthor c={c} />
            <a href={`#comment-${c.id}`} className="text-muted">
              {formatDateTime(c.createdAt)}
            </a>
            {c.editedAt && <span>(edited)</span>}
            {c.hidden && <span className="badge text-danger">Hidden while under review</span>}
          </p>
          {gone ? (
            <p className="mt-1 text-sm text-muted">{c.deleted ? "[deleted]" : "[hidden while under review]"}</p>
          ) : (
            <>
              {c.deleted && <p className="mt-1 text-sm text-danger">Deleted (only the admin sees this)</p>}
              {c.body && <p className="mt-1 whitespace-pre-wrap break-words">{c.body}</p>}
              {c.files.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {c.files.map((f) =>
                    f.kind === "image" ? (
                      <li key={f.id}>
                        <a href={`/api/files/${f.id}`} target="_blank" rel="noopener">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/files/${f.id}`}
                            alt={`Image in comment: ${f.name}`}
                            width={f.width ?? undefined}
                            height={f.height ?? undefined}
                            loading="lazy"
                            className="h-auto max-h-60 w-auto max-w-full rounded border border-line"
                          />
                        </a>
                      </li>
                    ) : (
                      <li key={f.id} className="card flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="break-all">
                          {f.name} <span className="text-muted">({formatBytes(f.size)})</span>
                        </span>
                        <a href={`/api/files/${f.id}?download=1`} className="btn btn-sm" aria-label={`Download ${f.name}`}>
                          <Download size={14} aria-hidden="true" />
                        </a>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </>
          )}
          <div className="mt-1 flex flex-wrap items-start gap-1">
            <CommentTools
              ctx={ctx}
              commentId={c.id}
              body={c.body}
              canReply={canComment && !c.deleted && !c.hidden}
              canEdit={c.viewer.canEdit}
              canDelete={c.viewer.canDelete}
              adminDelete={isAdmin && !c.viewer.isOwner}
            />
            {!c.viewer.isOwner && !c.deleted && !c.hidden && <ReportForm targetType="comment" targetId={c.id} className="" />}
          </div>
          {node.children.length > 0 &&
            (depth + 1 >= COMMENT_MAX_DEPTH ? (
              <ul className="mt-3 space-y-4">
                {node.children.map((n) => (
                  <CommentItem key={n.c.id} node={n} depth={depth} ctx={ctx} canComment={canComment} isAdmin={isAdmin} />
                ))}
              </ul>
            ) : (
              <ul className="mt-3 space-y-4 border-l border-line pl-3">
                {node.children.map((n) => (
                  <CommentItem key={n.c.id} node={n} depth={depth + 1} ctx={ctx} canComment={canComment} isAdmin={isAdmin} />
                ))}
              </ul>
            ))}
        </div>
      </div>
    </li>
  );
}

export function CommentThread({ comments, ctx, canComment, isAdmin }: { comments: CommentView[]; ctx: ComposerContext; canComment: boolean; isAdmin: boolean }) {
  const tree = buildTree(comments);
  if (tree.length === 0) return <p className="mt-4 text-sm text-muted">No comments yet.</p>;
  return (
    <ul className="mt-4 space-y-5">
      {tree.map((n) => (
        <CommentItem key={n.c.id} node={n} depth={0} ctx={ctx} canComment={canComment} isAdmin={isAdmin} />
      ))}
    </ul>
  );
}
