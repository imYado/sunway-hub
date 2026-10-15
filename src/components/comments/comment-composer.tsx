"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { CleanTextarea } from "@/components/ui/clean-input";
import { COMMENT_FILE_KINDS, COMMENT_FILE_MAX_BYTES, FILE_RULES, MAX_FILES_PER_COMMENT, MB, formatBytes, precheckCommentFile, type FileKind } from "@/lib/files";
import { PROFANITY_MESSAGE, containsProfanity } from "@/lib/profanity/filter";
import { COMMENT_MAX } from "@/lib/rules";
import { uploadToQuarantine } from "@/lib/upload-client";
import { createCommentAction } from "@/app/actions/posts";

export interface ComposerContext {
  postId: string;
  userId: string;
  storageDriver: "vercel" | "local";
  enabledKinds: FileKind[];
}

/** Writes a new comment or a reply, with up to 3 images or PDFs. */
export function CommentComposer({
  ctx,
  parentId,
  onDone,
  onCancel,
  autoFocus = false,
}: {
  ctx: ComposerContext;
  parentId?: string;
  onDone?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const kinds = ctx.enabledKinds.filter((k) => COMMENT_FILE_KINDS.includes(k));
  const accept = kinds.flatMap((k) => FILE_RULES[k].ext.map((e) => `.${e}`)).join(",");

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const problem = precheckCommentFile(f, ctx.enabledKinds) ?? (containsProfanity(f.name) ? PROFANITY_MESSAGE : null);
      if (problem) {
        setError(problem);
        continue;
      }
      if (next.length >= MAX_FILES_PER_COMMENT) {
        setError(`You can attach up to ${MAX_FILES_PER_COMMENT} files to a comment.`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const body = String(new FormData(e.currentTarget).get("body") ?? "").trim();
    if (!body && files.length === 0) {
      setError("Write a comment or attach a file.");
      return;
    }
    if (containsProfanity(body)) {
      setError(PROFANITY_MESSAGE);
      return;
    }
    setBusy(true);
    try {
      const uploaded = [];
      for (const f of files) uploaded.push(await uploadToQuarantine(f, ctx.userId, ctx.storageDriver, "comment"));
      const r = await createCommentAction({ postId: ctx.postId, parentId: parentId ?? "", body, files: uploaded });
      if (!r?.ok) {
        setError(r?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setFiles([]);
      setFormKey((k) => k + 1);
      router.refresh();
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form key={formKey} onSubmit={onSubmit} className="mt-2">
      <label htmlFor={`${id}-body`} className={parentId ? "sr-only" : "label"}>
        {parentId ? "Your reply" : "Add a comment"}
      </label>
      <CleanTextarea id={`${id}-body`} name="body" rows={parentId ? 3 : 4} maxLength={COMMENT_MAX} autoFocus={autoFocus} placeholder={parentId ? "Write a reply" : "What do you think?"} />
      {files.length > 0 && (
        <ul className="mt-2 space-y-1" aria-label="Files to attach">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="card flex items-center justify-between gap-2 px-3 py-1 text-sm">
              <span className="break-all">
                {f.name} <span className="text-muted">({formatBytes(f.size)})</span>
              </span>
              <button type="button" className="btn btn-sm" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Posting..." : parentId ? "Reply" : "Comment"}
        </button>
        {kinds.length > 0 && (
          <label className="btn btn-sm cursor-pointer">
            <Paperclip size={14} aria-hidden="true" /> Attach
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={accept}
              className="sr-only"
              onChange={(e) => addFiles(e.target.files)}
              aria-describedby={`${id}-files-hint`}
            />
          </label>
        )}
        {onCancel && (
          <button type="button" className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
      <p id={`${id}-files-hint`} className="hint">
        Images (JPG, PNG, WebP) or PDF, up to {COMMENT_FILE_MAX_BYTES / MB} MB each, {MAX_FILES_PER_COMMENT} per comment.
      </p>
      {error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
