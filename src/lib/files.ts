// Upload rules and content sniffing (magic bytes). Shared by server and client.

export type FileKind = "image" | "pdf" | "docx" | "pptx" | "video";

export const MB = 1024 * 1024;

export const FILE_RULES: Record<FileKind, { mime: string[]; ext: string[]; maxBytes: number; label: string }> = {
  image: { mime: ["image/jpeg", "image/png", "image/webp"], ext: ["jpg", "jpeg", "png", "webp"], maxBytes: 10 * MB, label: "Image" },
  pdf: { mime: ["application/pdf"], ext: ["pdf"], maxBytes: 25 * MB, label: "PDF" },
  docx: {
    mime: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ext: ["docx"],
    maxBytes: 25 * MB,
    label: "Word document",
  },
  pptx: {
    mime: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ext: ["pptx"],
    maxBytes: 25 * MB,
    label: "PowerPoint",
  },
  video: { mime: ["video/mp4"], ext: ["mp4"], maxBytes: 50 * MB, label: "MP4 video" },
};

export const MAX_FILES_PER_POST = 10;
// Comments take fewer, smaller files, and only images and PDFs.
export const COMMENT_FILE_KINDS: FileKind[] = ["image", "pdf"];
export const COMMENT_FILE_MAX_BYTES = 5 * MB;
export const MAX_FILES_PER_COMMENT = 3;

/** precheckFile for a comment attachment: images and PDFs up to 5 MB. */
export function precheckCommentFile(file: { name: string; type: string; size: number }, enabledKinds: FileKind[]): string | null {
  const problem = precheckFile(file, enabledKinds.filter((k) => COMMENT_FILE_KINDS.includes(k)));
  if (problem) return problem.replace("is not an allowed file type.", "can't be attached to a comment. Use a JPG, PNG, WebP or PDF.");
  if (file.size > COMMENT_FILE_MAX_BYTES) return `"${file.name}" is too large. Comment attachments can be up to ${COMMENT_FILE_MAX_BYTES / MB} MB.`;
  return null;
}
/** Private messages: images only (no video), re-encoded and stored encrypted. */
export const DM_FILE_KINDS: FileKind[] = ["image"];
export const DM_FILE_MAX_BYTES = 5 * MB;
export const MAX_FILES_PER_DM = 4;

export function precheckDmFile(file: { name: string; type: string; size: number }): string | null {
  const problem = precheckFile(file, DM_FILE_KINDS);
  if (problem) return problem.replace("is not an allowed file type.", "can't be sent. Messages accept JPG, PNG or WebP images only.");
  if (file.size > DM_FILE_MAX_BYTES) return `"${file.name}" is too large. Images in messages can be up to ${DM_FILE_MAX_BYTES / MB} MB.`;
  return null;
}
export const AVATAR_MAX_BYTES = 2 * MB;
export const AVATAR_MIME = ["image/jpeg", "image/png", "image/webp"];

export const ALL_ALLOWED_MIME = Object.values(FILE_RULES).flatMap((r) => r.mime);

export function kindForMime(mime: string): FileKind | null {
  for (const [kind, rule] of Object.entries(FILE_RULES) as [FileKind, (typeof FILE_RULES)[FileKind]][]) {
    if (rule.mime.includes(mime)) return kind;
  }
  return null;
}

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/** Checks declared type, extension and size before upload. Returns a problem or null. */
export function precheckFile(
  file: { name: string; type: string; size: number },
  enabledKinds: FileKind[] = Object.keys(FILE_RULES) as FileKind[],
): string | null {
  const kind = kindForMime(file.type);
  if (!kind || !enabledKinds.includes(kind)) return `"${file.name}" is not an allowed file type.`;
  if (!FILE_RULES[kind].ext.includes(extensionOf(file.name))) return `"${file.name}" has the wrong file extension for its type.`;
  if (file.size <= 0) return `"${file.name}" is empty.`;
  if (file.size > FILE_RULES[kind].maxBytes) {
    return `"${file.name}" is too large. ${FILE_RULES[kind].label} files can be up to ${FILE_RULES[kind].maxBytes / MB} MB.`;
  }
  return null;
}

function startsWith(buf: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function asciiAt(buf: Uint8Array, offset: number, text: string): boolean {
  return startsWith(
    buf,
    [...text].map((c) => c.charCodeAt(0)),
    offset,
  );
}

function containsAscii(buf: Uint8Array, text: string): boolean {
  const needle = [...text].map((c) => c.charCodeAt(0));
  outer: for (let i = 0; i <= buf.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (buf[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Detects the real type of a file from its bytes. Returns null for anything
 * that is not one of the allowed formats (including HTML, SVG, scripts, ZIPs).
 */
export function sniffFileType(buf: Uint8Array): { kind: FileKind; mime: string } | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: "image", mime: "image/jpeg" };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", mime: "image/png" };
  if (asciiAt(buf, 0, "RIFF") && asciiAt(buf, 8, "WEBP")) return { kind: "image", mime: "image/webp" };
  if (asciiAt(buf, 0, "%PDF-")) return { kind: "pdf", mime: "application/pdf" };
  if (asciiAt(buf, 4, "ftyp")) {
    const brand = String.fromCharCode(...buf.slice(8, 12));
    if (/^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |dash|MSNV)$/.test(brand)) return { kind: "video", mime: "video/mp4" };
    return null;
  }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    // Office Open XML: a ZIP whose entries include the main document part.
    // Entry names are stored uncompressed in the local and central headers.
    if (!containsAscii(buf, "[Content_Types].xml")) return null;
    if (containsAscii(buf, "word/document.xml")) {
      return { kind: "docx", mime: FILE_RULES.docx.mime[0] };
    }
    if (containsAscii(buf, "ppt/presentation.xml")) {
      return { kind: "pptx", mime: FILE_RULES.pptx.mime[0] };
    }
    return null;
  }
  return null;
}

export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f"\\/<>:|?*]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "file").slice(0, 120);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * MB) return `${(n / MB).toFixed(1)} MB`;
  return `${(n / (1024 * MB)).toFixed(2)} GB`;
}
