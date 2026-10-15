"use client";

import { useState } from "react";
import { Pencil, Reply } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CleanTextarea } from "@/components/ui/clean-input";
import { COMMENT_MAX } from "@/lib/rules";
import { deleteCommentAction, editCommentAction } from "@/app/actions/posts";
import { CommentComposer, type ComposerContext } from "./comment-composer";

/** Reply, Edit and Delete for one comment. Forms open inline under the comment. */
export function CommentTools({
  ctx,
  commentId,
  body,
  canReply,
  canEdit,
  canDelete,
  adminDelete,
}: {
  ctx: ComposerContext;
  commentId: string;
  body: string;
  canReply: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** The admin removing someone else's comment must give a reason. */
  adminDelete: boolean;
}) {
  const [open, setOpen] = useState<"reply" | "edit" | null>(null);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1">
        {canReply && (
          <button type="button" className="btn btn-sm" aria-expanded={open === "reply"} onClick={() => setOpen(open === "reply" ? null : "reply")}>
            <Reply size={14} aria-hidden="true" /> Reply
          </button>
        )}
        {canEdit && (
          <button type="button" className="btn btn-sm" aria-expanded={open === "edit"} onClick={() => setOpen(open === "edit" ? null : "edit")}>
            <Pencil size={14} aria-hidden="true" /> Edit
          </button>
        )}
        {canDelete && !adminDelete && (
          <ActionForm action={deleteCommentAction} confirm="Delete this comment?">
            <input type="hidden" name="commentId" value={commentId} />
            <SubmitButton variant="default" size="sm">
              Delete
            </SubmitButton>
          </ActionForm>
        )}
      </div>
      {canDelete && adminDelete && (
        <details className="mt-1">
          <summary className="btn btn-sm cursor-pointer list-none">Remove</summary>
          <ActionForm action={deleteCommentAction} className="surface mt-2 p-3">
            <input type="hidden" name="commentId" value={commentId} />
            <label htmlFor={`rm-${commentId}`} className="label">
              Reason (sent to the commenter)
            </label>
            <CleanTextarea id={`rm-${commentId}`} name="reason" required maxLength={500} rows={2} />
            <div className="mt-2">
              <SubmitButton variant="danger" size="sm">
                Remove comment
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      )}
      {open === "reply" && <CommentComposer ctx={ctx} parentId={commentId} autoFocus onDone={() => setOpen(null)} onCancel={() => setOpen(null)} />}
      {open === "edit" && (
        <ActionForm action={editCommentAction} className="mt-2">
          <input type="hidden" name="commentId" value={commentId} />
          <input type="hidden" name="postId" value={ctx.postId} />
          <label htmlFor={`edit-${commentId}`} className="sr-only">
            Edit your comment
          </label>
          <CleanTextarea id={`edit-${commentId}`} name="body" defaultValue={body} required maxLength={COMMENT_MAX} rows={3} autoFocus />
          <div className="mt-2 flex gap-2">
            <SubmitButton size="sm">Save</SubmitButton>
            <button type="button" className="btn btn-sm" onClick={() => setOpen(null)}>
              Cancel
            </button>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
