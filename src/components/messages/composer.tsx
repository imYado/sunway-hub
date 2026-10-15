"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { DM_FILE_MAX_BYTES, FILE_RULES, MAX_FILES_PER_DM, MB, formatBytes, precheckDmFile } from "@/lib/files";
import { DM_MAX } from "@/lib/rules";
import { uploadToQuarantine } from "@/lib/upload-client";
import { sendMessageAction } from "@/app/actions/messages";

/** Writes a message with up to 4 images (JPG, PNG or WebP, 5 MB each). No videos or other files. */
export function MessageComposer({ conversationId, userId, storageDriver }: { conversationId: string; userId: string; storageDriver: "vercel" | "local" }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const accept = FILE_RULES.image.ext.map((e) => `.${e}`).join(",");

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const problem = precheckDmFile(f);
      if (problem) {
        setError(problem);
        continue;
      }
      if (next.length >= MAX_FILES_PER_DM) {
        setError(`You can send up to ${MAX_FILES_PER_DM} images at a time.`);
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
    if (!body && files.length === 0) return setError("Write a message or add an image.");
    setBusy(true);
    try {
      const uploaded = [];
      for (const f of files) uploaded.push(await uploadToQuarantine(f, userId, storageDriver, "dm"));
      const r = await sendMessageAction(conversationId, { body, files: uploaded });
      if (!r?.ok) return setError(r?.error ?? "Something went wrong. Please try again.");
      setFiles([]);
      setFormKey((k) => k + 1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form key={formKey} onSubmit={onSubmit} className="sticky bottom-20 rounded-[22px] border border-line bg-bg p-2 md:bottom-4">
      {files.length > 0 && (
        <ul className="mb-2 space-y-1 px-2" aria-label="Images to send">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-[16px] bg-surface px-3 py-1 text-sm">
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
      <div className="flex items-end gap-2">
        <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink hover:bg-surface" title="Add image">
          <ImagePlus size={22} aria-hidden="true" />
          <span className="sr-only">Add image</span>
          <input ref={fileInput} type="file" multiple accept={accept} className="sr-only" onChange={(e) => addFiles(e.target.files)} aria-describedby="dm-files-hint" />
        </label>
        <label htmlFor="dm-message" className="sr-only">
          Message
        </label>
        <textarea id="dm-message" name="body" rows={1} maxLength={DM_MAX} placeholder="Message..." className="input min-h-[40px] flex-1 resize-none border-0 bg-transparent" />
        <button type="submit" className="btn btn-primary btn-sm shrink-0" disabled={busy}>
          {busy ? "Sending..." : "Send"}
        </button>
      </div>
      <p id="dm-files-hint" className="sr-only">
        JPG, PNG or WebP images only, up to {DM_FILE_MAX_BYTES / MB} MB each, {MAX_FILES_PER_DM} per message.
      </p>
      {error && (
        <p role="alert" className="mt-1 px-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
