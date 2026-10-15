"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { CleanInput, CleanTextarea } from "@/components/ui/clean-input";
import { FILE_RULES, MAX_FILES_PER_POST, formatBytes, precheckFile, type FileKind } from "@/lib/files";
import { PROFANITY_MESSAGE, containsProfanity } from "@/lib/profanity/filter";
import {
  DESCRIPTION_MAX,
  LINK_LABEL_MAX,
  LINK_URL_MAX,
  MAX_LINKS_PER_POST,
  MARKET_KINDS,
  MAX_TAGS,
  POST_TYPES,
  TITLE_MAX,
  cleanLinkUrl,
  type PostType,
} from "@/lib/rules";
import { uploadToQuarantine } from "@/lib/upload-client";
import { createPostAction, editPostAction } from "@/app/actions/posts";

/** The current values of a post being edited. */
export interface EditablePost {
  id: string;
  type: PostType;
  marketKind: string | null;
  title: string;
  description: string;
  tags: string[];
  semester: string | null;
  clubId: string | null;
  anonymous: boolean;
  links: { url: string; label: string }[];
  files: { id: string; name: string; size: number }[];
  event: { startsAt: string; endsAt: string; location: string; capacity: number | null } | null;
}

interface Props {
  userId: string;
  /** Clubs this member manages: they can post as these clubs. */
  clubs: { id: string; name: string }[];
  /** Every club, for tagging. */
  allClubs: { id: string; name: string }[];
  semesters: string[];
  enabledKinds: FileKind[];
  storageDriver: "vercel" | "local";
  defaultType?: PostType;
  defaultClubId?: string;
  /** Set when editing an existing post. */
  post?: EditablePost;
}

export function PostForm({ userId, clubs, allClubs, semesters, enabledKinds, storageDriver, defaultType = "discussion", defaultClubId, post }: Props) {
  const router = useRouter();
  const formId = useId();
  const editing = !!post;
  const [type, setType] = useState<PostType>(post?.type ?? defaultType);
  const [files, setFiles] = useState<File[]>([]);
  const [keptFiles, setKeptFiles] = useState(post?.files ?? []);
  const [links, setLinks] = useState<{ url: string; label: string }[]>(post?.links ?? []);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [tags, setTags] = useState<string[]>(post?.tags ?? []);
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
    if (!t || tags.includes(t) || tags.length >= MAX_TAGS) return;
    if (containsProfanity(t)) {
      setError(PROFANITY_MESSAGE);
      return;
    }
    setTags([...tags, t]);
    setTagInput("");
    setSuggestions([]);
  }

  function addLink() {
    const url = cleanLinkUrl(linkUrl);
    if (!url) {
      setError("Enter a web link starting with https://");
      return;
    }
    const label = linkLabel.replace(/\s+/g, " ").trim();
    if (containsProfanity(label)) {
      setError(PROFANITY_MESSAGE);
      return;
    }
    if (links.length >= MAX_LINKS_PER_POST) {
      setError(`You can add up to ${MAX_LINKS_PER_POST} links.`);
      return;
    }
    if (links.some((l) => l.url === url)) {
      setError("You already added that link.");
      return;
    }
    setError(null);
    setLinks([...links, { url, label }]);
    setLinkUrl("");
    setLinkLabel("");
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
      if (next.length + keptFiles.length >= MAX_FILES_PER_POST) {
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
      setError("Add at least one tag, like the course code.");
      return;
    }
    const allTags = tagInput.trim() && tags.length < MAX_TAGS ? [...tags, tagInput.trim()] : tags;
    // A link typed but not added yet is included, like a half-typed tag.
    const pendingUrl = linkUrl.trim() ? cleanLinkUrl(linkUrl) : null;
    if (linkUrl.trim() && !pendingUrl) {
      setError("Enter a web link starting with https://, or clear the link box.");
      return;
    }
    const allLinks =
      pendingUrl && links.length < MAX_LINKS_PER_POST && !links.some((l) => l.url === pendingUrl)
        ? [...links, { url: pendingUrl, label: linkLabel.trim() }]
        : links;
    setBusy(true);
    try {
      const uploaded: { pathname: string; name: string }[] = [];
      for (const [i, f] of files.entries()) {
        setProgress(`Uploading file ${i + 1} of ${files.length}: ${f.name}`);
        uploaded.push(await uploadToQuarantine(f, userId, storageDriver));
      }
      setProgress(files.length ? "Checking your files..." : "Saving...");
      const fields = {
        title,
        description,
        subjects: allTags,
        semester: String(fd.get("semester") ?? ""),
        marketKind: type === "market" ? (String(fd.get("marketKind") ?? "") as "sell") : undefined,
        clubId: String(fd.get("clubId") ?? ""),
        links: allLinks,
        anonymous: type !== "club" && fd.get("anonymous") === "on",
        keepFileIds: keptFiles.map((f) => f.id),
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
      };
      const result = post ? await editPostAction(post.id, fields) : await createPostAction({ ...fields, type });
      if (!result?.ok) {
        setError(result?.error ?? "Something went wrong. Please try again.");
        setProgress(null);
        return;
      }
      const data = result.data as { id: string };
      router.push(`/posts/${data.id}`);
      router.refresh();
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
      {!editing && (
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
      )}

      {type === "market" && (
        <fieldset className="mb-4">
          <legend className="label">What are you doing?</legend>
          <div className="flex flex-wrap gap-4">
            {MARKET_KINDS.map((k, i) => (
              <label key={k.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="marketKind"
                  value={k.value}
                  required
                  defaultChecked={post?.marketKind ? post.marketKind === k.value : i === 0}
                  className="h-4 w-4"
                />
                {k.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mb-4">
        <label htmlFor="title" className="label">
          Title
        </label>
        <CleanInput id="title" name="title" required minLength={5} maxLength={TITLE_MAX} defaultValue={post?.title} />
      </div>

      <div className="mb-4">
        <label htmlFor="description" className="label">
          Description
        </label>
        <CleanTextarea id="description" name="description" maxLength={DESCRIPTION_MAX} rows={6} showCount defaultValue={post?.description} />
      </div>

      <div className="mb-4">
        <label htmlFor="subject" className="label">
          Tags {type === "study" ? "" : "(optional)"}
        </label>
        {tags.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2" aria-label="Selected tags">
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
          disabled={tags.length >= MAX_TAGS}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          placeholder="e.g. CSC1024, Past Papers, Food"
          aria-describedby="subject-hint"
        />
        <datalist id={`${formId}-subjects`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <p id="subject-hint" className="hint">
          A course code, topic or anything that helps people find it. Press Enter to add. Up to {MAX_TAGS}.
        </p>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="semester" className="label">
            Semester
          </label>
          <select id="semester" name="semester" className="input" defaultValue={post?.semester ?? ""}>
            <option value="">Not specific</option>
            {semesters.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {(type === "club" ? clubs : allClubs).length > 0 && (
          <div>
            <label htmlFor="clubId" className="label">
              {type === "club" ? "Club" : "Club tag (optional)"}
            </label>
            <select
              key={type === "club" ? "own" : "all"}
              id="clubId"
              name="clubId"
              className="input"
              defaultValue={post?.clubId ?? defaultClubId ?? ""}
              required={type === "club"}
            >
              <option value="">None</option>
              {(type === "club" ? clubs : allClubs).map((c) => (
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
            <input id="startsAt" name="startsAt" type="datetime-local" required className="input" defaultValue={post?.event?.startsAt} />
          </div>
          <div>
            <label htmlFor="endsAt" className="label">
              Ends (optional)
            </label>
            <input id="endsAt" name="endsAt" type="datetime-local" className="input" defaultValue={post?.event?.endsAt} />
          </div>
          <div>
            <label htmlFor="location" className="label">
              Location
            </label>
            <CleanInput id="location" name="location" required maxLength={200} defaultValue={post?.event?.location} />
          </div>
          <div>
            <label htmlFor="capacity" className="label">
              Capacity (optional)
            </label>
            <input id="capacity" name="capacity" type="number" min={1} className="input" defaultValue={post?.event?.capacity ?? undefined} />
          </div>
          <p className="text-sm text-muted sm:col-span-2">Attach a poster image below if you have one.</p>
        </fieldset>
      )}

      <div className="mb-4">
        {keptFiles.length > 0 && (
          <ul className="mb-2 space-y-1" aria-label="Current attachments">
            {keptFiles.map((f) => (
              <li key={f.id} className="card flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="break-all">
                  {f.name} <span className="text-muted">({formatBytes(f.size)})</span>
                </span>
                <button type="button" className="btn btn-sm" onClick={() => setKeptFiles(keptFiles.filter((k) => k.id !== f.id))} aria-label={`Remove ${f.name}`}>
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label htmlFor="files" className="label">
          {editing ? "Add attachments (optional)" : "Attachments (optional)"}
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

      <fieldset className="mb-4">
        <legend className="label">Links (optional)</legend>
        {links.length > 0 && (
          <ul className="mb-2 space-y-1" aria-label="Added links">
            {links.map((l, i) => (
              <li key={l.url} className="card flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="break-all">
                  {l.label ? `${l.label} ` : ""}
                  <span className="text-muted">{l.url}</span>
                </span>
                <button type="button" className="btn btn-sm" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label={`Remove link ${l.label || l.url}`}>
                  <X size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
          <div>
            <label htmlFor="linkUrl" className="sr-only">
              Link address
            </label>
            <input
              id="linkUrl"
              type="url"
              inputMode="url"
              className="input"
              value={linkUrl}
              maxLength={LINK_URL_MAX}
              disabled={links.length >= MAX_LINKS_PER_POST}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLink();
                }
              }}
              placeholder="https://..."
              aria-describedby="links-hint"
            />
          </div>
          <div>
            <label htmlFor="linkLabel" className="sr-only">
              Link name
            </label>
            <CleanInput
              id="linkLabel"
              value={linkLabel}
              maxLength={LINK_LABEL_MAX}
              disabled={links.length >= MAX_LINKS_PER_POST}
              onChange={(e) => setLinkLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLink();
                }
              }}
              placeholder="Name (optional)"
            />
          </div>
          <button type="button" className="btn" onClick={addLink} disabled={links.length >= MAX_LINKS_PER_POST}>
            Add link
          </button>
        </div>
        <p id="links-hint" className="hint">
          Link to official pages, like an exam board&apos;s past papers page. Don&apos;t link to copied exam papers, answers or paid material. Up to{" "}
          {MAX_LINKS_PER_POST}.
        </p>
      </fieldset>

      {type !== "club" && (
        <div className="mb-4 flex items-start gap-3">
          <input
            id="anonymous"
            name="anonymous"
            type="checkbox"
            defaultChecked={post?.anonymous}
            className="mt-1 h-5 w-5 shrink-0"
            aria-describedby="anonymous-hint"
          />
          <div>
            <label htmlFor="anonymous" className="text-sm font-medium">
              Post anonymously
            </label>
            <p id="anonymous-hint" className="hint">
              Other members see &quot;Anonymous&quot; and the post stays off your profile. The admin can still see who posted it.
            </p>
          </div>
        </div>
      )}

      <p className="mb-4 text-sm text-muted">
        {editing
          ? "Your changes show as edited. If the admin asked for changes, saving sends the post back for approval."
          : "Your post appears straight away. The admin reviews posts and removes any that break the guidelines. You can edit it later."}
      </p>

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? (editing ? "Saving..." : "Submitting...") : editing ? "Save changes" : "Post"}
      </button>
      <p className="mt-2 text-xs text-muted">
        By posting, you confirm you have the right to share this and agree to the{" "}
        <Link href="/guidelines" target="_blank">
          Community Guidelines
        </Link>{" "}
        and{" "}
        <Link href="/terms" target="_blank">
          Terms
        </Link>
        .
      </p>
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
