"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { CleanInput, CleanTextarea } from "@/components/ui/clean-input";
import { FILE_RULES, MAX_FILES_PER_POST, formatBytes, precheckFile, safeFileName, type FileKind } from "@/lib/files";
import { PROFANITY_MESSAGE, containsProfanity } from "@/lib/profanity/filter";
import { DESCRIPTION_MAX, MAX_SUBJECT_TAGS, OWN_WORK_STATEMENT, POST_TYPES, TITLE_MAX } from "@/lib/rules";
import { createPostAction } from "@/app/actions/posts";

interface Props {
  userId: string;
  clubs: { id: string; name: string }[];
  semesters: string[];
  enabledKinds: FileKind[];
  storageDriver: "vercel" | "local";
  defaultType?: "study" | "event" | "club";
  defaultClubId?: string;
}

async function uploadOne(file: File, userId: string, driver: "vercel" | "local"): Promise<{ pathname: string; name: string }> {
  const name = safeFileName(file.name);
  const pathname = `quarantine/${userId}/${name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
  if (driver === "local") {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("pathname", pathname);
    const res = await fetch("/api/uploads/local", { method: "POST", body: fd });
    const json = (await res.json()) as { pathname?: string; error?: string };
    if (!res.ok || !json.pathname) throw new Error(json.error ?? "Upload failed.");
    return { pathname: json.pathname, name };
  }
  const result = await upload(pathname, file, {
    access: "private",
    handleUploadUrl: "/api/uploads/authorize",
    clientPayload: JSON.stringify({ name, size: file.size, contentType: file.type }),
    contentType: file.type,
    multipart: file.size > 8 * 1024 * 1024,
  });
  return { pathname: result.pathname, name };
}

export function NewPostForm({ userId, clubs, semesters, enabledKinds, storageDriver, defaultType = "study", defaultClubId }: Props) {
  const router = useRouter();
  const formId = useId();
  const [type, setType] = useState<"study" | "event" | "club">(defaultType);
  const [files, setFiles] = useState<File[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = tagInput.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/subjects?q=${encodeURIComponent(q)}`);
        if (res.ok) setSuggestions(((await res.json()) as { subjects: string[] }).subjects.filter((s) => !tags.includes(s)));
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [tagInput, tags]);

  function addTag(raw: string) {
    const t = raw.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!t || tags.includes(t) || tags.length >= MAX_SUBJECT_TAGS) return;
    if (containsProfanity(t)) {
      setError(PROFANITY_MESSAGE);
      return;
    }
    setTags([...tags, t]);
    setTagInput("");
    setSuggestions([]);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const problem = precheckFile(f, enabledKinds) ?? (containsProfanity(f.name) ? PROFANITY_MESSAGE : null);
      if (problem) {
        setError(problem);
        continue;
      }
      if (next.length >= MAX_FILES_PER_POST) {
        setError(`You can attach up to ${MAX_FILES_PER_POST} files.`);
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
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "");
    const description = String(fd.get("description") ?? "");
    if (containsProfanity(title) || containsProfanity(description)) {
      setError(PROFANITY_MESSAGE);
      return;
    }
    if (type === "study" && tags.length === 0 && !tagInput.trim()) {
      setError("Add at least one subject tag.");
      return;
    }
    const allTags = tagInput.trim() && tags.length < MAX_SUBJECT_TAGS ? [...tags, tagInput.trim()] : tags;
    setBusy(true);
    try {
      const uploaded: { pathname: string; name: string }[] = [];
      for (const [i, f] of files.entries()) {
        setProgress(`Uploading file ${i + 1} of ${files.length}: ${f.name}`);
        uploaded.push(await uploadOne(f, userId, storageDriver));
      }
      setProgress("Checking your files...");
      const result = await createPostAction({
        type,
        title,
        description,
        subjects: allTags,
        semester: String(fd.get("semester") ?? ""),
        clubId: String(fd.get("clubId") ?? ""),
        ownWork: fd.get("ownWork") === "on" ? true : (false as unknown as true),
        files: uploaded,
        event:
          type === "event"
            ? {
                startsAt: String(fd.get("startsAt") ?? ""),
                endsAt: String(fd.get("endsAt") ?? ""),
                location: String(fd.get("location") ?? ""),
                capacity: String(fd.get("capacity") ?? "") as unknown as number,
              }
            : undefined,
      });
      if (!result?.ok) {
        setError(result?.error ?? "Something went wrong. Please try again.");
        setProgress(null);
        return;
      }
      const data = result.data as { id: string };
      router.push(`/posts/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setProgress(null);
    } finally {
      setBusy(false);
    }
  }

  const accept = enabledKinds.flatMap((k) => FILE_RULES[k].ext.map((e) => `.${e}`)).join(",");

  return (
    <form onSubmit={onSubmit} aria-describedby={error ? `${formId}-error` : undefined}>
      <fieldset className="mb-4">
        <legend className="label">Type</legend>
        <div className="flex flex-wrap gap-4">
          {POST_TYPES.filter((t) => t.value !== "club" || clubs.length > 0).map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="type" value={t.value} checked={type === t.value} onChange={() => setType(t.value)} className="h-4 w-4" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mb-4">
        <label htmlFor="title" className="label">
          Title
        </label>
        <CleanInput id="title" name="title" required minLength={5} maxLength={TITLE_MAX} />
      </div>

      <div className="mb-4">
        <label htmlFor="description" className="label">
          Description
        </label>
        <CleanTextarea id="description" name="description" maxLength={DESCRIPTION_MAX} rows={6} showCount />
      </div>

      <div className="mb-4">
        <label htmlFor="subject" className="label">
          Subject tags {type === "study" ? "" : "(optional)"}
        </label>
        {tags.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2" aria-label="Selected subjects">
            {tags.map((t) => (
              <li key={t} className="badge gap-1">
                {t}
                <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`} className="ml-1">
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          id="subject"
          className="input"
          value={tagInput}
          list={`${formId}-subjects`}
          disabled={tags.length >= MAX_SUBJECT_TAGS}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          placeholder="e.g. CSC1024 Programming Principles"
          aria-describedby="subject-hint"
        />
        <datalist id={`${formId}-subjects`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p id="subject-hint" className="hint">
          Course code or name. Press Enter to add. Up to {MAX_SUBJECT_TAGS}.
        </p>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="semester" className="label">
            Semester
          </label>
          <select id="semester" name="semester" className="input" defaultValue="">
            <option value="">Not specific</option>
            {semesters.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {clubs.length > 0 && (
          <div>
            <label htmlFor="clubId" className="label">
              Club {type === "club" ? "" : "(optional)"}
            </label>
            <select id="clubId" name="clubId" className="input" defaultValue={defaultClubId ?? ""} required={type === "club"}>
              <option value="">None</option>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {type === "event" && (
        <fieldset className="surface mb-4 grid gap-4 p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">Event details (Kuala Lumpur time)</legend>
          <div>
            <label htmlFor="startsAt" className="label">
              Starts
            </label>
            <input id="startsAt" name="startsAt" type="datetime-local" required className="input" />
          </div>
          <div>
            <label htmlFor="endsAt" className="label">
              Ends (optional)
            </label>
            <input id="endsAt" name="endsAt" type="datetime-local" className="input" />
          </div>
          <div>
            <label htmlFor="location" className="label">
              Location
            </label>
            <CleanInput id="location" name="location" required maxLength={200} />
          </div>
          <div>
            <label htmlFor="capacity" className="label">
              Capacity (optional)
            </label>
            <input id="capacity" name="capacity" type="number" min={1} className="input" />
          </div>
          <p className="text-sm text-muted sm:col-span-2">Attach a poster image below if you have one.</p>
        </fieldset>
      )}

      <div className="mb-4">
        <label htmlFor="files" className="label">
          Attachments (optional)
        </label>
        <input
          ref={fileInput}
          id="files"
          type="file"
          multiple
          accept={accept}
          onChange={(e) => addFiles(e.target.files)}
          className="block w-full text-sm"
          aria-describedby="files-hint"
        />
        <p id="files-hint" className="hint">
          Images (JPG, PNG, WebP) up to 10 MB, PDF, DOCX and PPTX up to 25 MB, MP4 video up to 50 MB. Up to {MAX_FILES_PER_POST} files.
        </p>
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="card flex items-center justify-between gap-2 px-3 py-2 text-sm">
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
      </div>

      <div className="mb-6 flex items-start gap-3">
        <input id="ownWork" name="ownWork" type="checkbox" required className="mt-1 h-5 w-5 shrink-0" />
        <label htmlFor="ownWork" className="text-sm">
          {OWN_WORK_STATEMENT}
        </label>
      </div>

      <p className="mb-4 text-sm text-muted">
        The admin reviews every post before others can see it. After submitting you can only edit the title.
      </p>

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Submitting..." : "Submit for approval"}
      </button>
      {progress && (
        <p role="status" className="mt-2 text-sm text-muted">
          {progress}
        </p>
      )}
      {error && (
        <p id={`${formId}-error`} role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
