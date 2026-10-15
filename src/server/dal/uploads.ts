import "server-only";
import { and, eq, isNull, sql, sum } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "@/db";
import { storedFiles, uploadQuotas } from "@/db/schema";
import { encryptBytes, sha256Hex } from "@/lib/crypto";
import { klDayKey } from "@/lib/dates";
import { env } from "@/lib/env";
import {
  AVATAR_MAX_BYTES,
  COMMENT_FILE_KINDS,
  COMMENT_FILE_MAX_BYTES,
  DM_FILE_KINDS,
  DM_FILE_MAX_BYTES,
  FILE_RULES,
  MB,
  extensionOf,
  kindForMime,
  precheckCommentFile,
  precheckDmFile,
  precheckFile,
  safeFileName,
  sniffFileType,
  type FileKind,
} from "@/lib/files";
import type { Actor } from "../actor-types";
import { AppError, ForbiddenError } from "../errors";
import { assertImageAllowed } from "../moderation";
import { assertClean } from "../profanity";
import { enforce, LIMITS } from "../rate-limit";
import { getSettings } from "../settings";
import { storage } from "../storage";

export const QUARANTINE_PREFIX = "quarantine/";
export const STORAGE_WARN_RATIO = 0.8;
export const STORAGE_REFUSE_RATIO = 0.9;

export function quarantinePrefixFor(userId: string): string {
  return `${QUARANTINE_PREFIX}${userId}/`;
}

/** Bytes used by all stored files (including soft-deleted ones that are still in Blob). */
export async function totalStoredBytes(): Promise<number> {
  const [r] = await db.select({ total: sum(storedFiles.size) }).from(storedFiles);
  return Number(r?.total ?? 0);
}

export async function storageStatus() {
  const used = await totalStoredBytes();
  const cap = env.storageCapBytes;
  const ratio = cap > 0 ? used / cap : 1;
  return { used, cap, ratio, warn: ratio >= STORAGE_WARN_RATIO, refuse: ratio >= STORAGE_REFUSE_RATIO };
}

export async function userStoredBytes(userId: string): Promise<number> {
  const [r] = await db
    .select({ total: sum(storedFiles.size) })
    .from(storedFiles)
    .where(and(eq(storedFiles.ownerId, userId), isNull(storedFiles.deletedAt)));
  return Number(r?.total ?? 0);
}

export type UploadPurpose = "post" | "comment" | "dm";

export interface UploadRequest {
  pathname: string;
  name: string;
  contentType: string;
  size: number;
}

/**
 * Authorises one client upload (Vercel Blob client upload token, or the local dev
 * upload route). Checks session (by requiring an Actor), path, type, size, the daily
 * quota, the per-user storage quota and the global storage cap.
 */
export async function authorizeUpload(
  actor: Actor,
  req: UploadRequest,
  purpose: UploadPurpose = "post",
): Promise<{ maxBytes: number; allowedContentTypes: string[] }> {
  await enforce("upload-auth", actor.id, LIMITS.uploadAuthPerUser.limit, LIMITS.uploadAuthPerUser.window);
  if (!req.pathname.startsWith(quarantinePrefixFor(actor.id)) || req.pathname.includes("..")) {
    throw new ForbiddenError("Invalid upload path.");
  }
  const settings = await getSettings();
  const file = { name: req.name, type: req.contentType, size: req.size };
  const problem =
    purpose === "dm"
      ? precheckDmFile(file)
      : purpose === "comment"
        ? precheckCommentFile(file, settings.enabledFileKinds)
        : precheckFile(file, settings.enabledFileKinds);
  if (problem) throw new AppError(problem);
  await assertClean(req.name.replace(/\.[a-z0-9]+$/i, ""));

  const status = await storageStatus();
  if (status.refuse || status.used + req.size > status.cap * STORAGE_REFUSE_RATIO) {
    throw new AppError("Uploads are paused because the site's shared storage is nearly full. Please try again later.", 503);
  }
  if ((await userStoredBytes(actor.id)) + req.size > settings.userStorageMb * MB) {
    throw new AppError(`You have reached your ${settings.userStorageMb} MB storage limit. Delete old posts to free space.`);
  }
  // Atomic daily counter (Kuala Lumpur calendar day).
  const day = klDayKey();
  const [q] = await db
    .insert(uploadQuotas)
    .values({ userId: actor.id, day, uploads: 1 })
    .onConflictDoUpdate({ target: [uploadQuotas.userId, uploadQuotas.day], set: { uploads: sql`${uploadQuotas.uploads} + 1` } })
    .returning({ uploads: uploadQuotas.uploads });
  if (!actor.isAdmin && q.uploads > settings.uploadsPerDay) {
    throw new AppError(`You can upload up to ${settings.uploadsPerDay} files per day. Please try again tomorrow.`);
  }
  const kind = kindForMime(req.contentType) as FileKind;
  const maxBytes =
    purpose === "dm"
      ? Math.min(FILE_RULES[kind].maxBytes, DM_FILE_MAX_BYTES)
      : purpose === "comment"
        ? Math.min(FILE_RULES[kind].maxBytes, COMMENT_FILE_MAX_BYTES)
        : FILE_RULES[kind].maxBytes;
  return { maxBytes, allowedContentTypes: FILE_RULES[kind].mime };
}

export interface ProcessedFile {
  data: Buffer;
  kind: FileKind;
  mime: string;
  ext: string;
  sha256: string;
  width: number | null;
  height: number | null;
}

/** Verifies the real type by content and re-encodes images to strip EXIF. */
export async function processFileBytes(input: Buffer, originalName: string, enabledKinds: FileKind[]): Promise<ProcessedFile> {
  const sniffed = sniffFileType(input);
  if (!sniffed || !enabledKinds.includes(sniffed.kind)) {
    throw new AppError(`"${originalName}" is not an allowed file type.`);
  }
  if (!FILE_RULES[sniffed.kind].ext.includes(extensionOf(originalName))) {
    throw new AppError(`"${originalName}" does not match its file extension.`);
  }
  if (input.length > FILE_RULES[sniffed.kind].maxBytes) {
    throw new AppError(`"${originalName}" is too large.`);
  }
  let data = input;
  let width: number | null = null;
  let height: number | null = null;
  let mime = sniffed.mime;
  let ext = extensionOf(originalName);
  if (sniffed.kind === "image") {
    try {
      // .rotate() applies EXIF orientation; sharp drops all metadata (EXIF, GPS) on output.
      const img = sharp(input, { limitInputPixels: 50_000_000 }).rotate();
      const out =
        sniffed.mime === "image/png"
          ? img.png({ compressionLevel: 9 })
          : sniffed.mime === "image/webp"
            ? img.webp({ quality: 85 })
            : img.jpeg({ quality: 85, mozjpeg: true });
      const { data: buf, info } = await out.toBuffer({ resolveWithObject: true });
      data = buf;
      width = info.width;
      height = info.height;
    } catch {
      throw new AppError(`"${originalName}" could not be read as an image.`);
    }
    mime = sniffed.mime;
    await assertImageAllowed(data, mime, originalName);
    ext = sniffed.mime === "image/png" ? "png" : sniffed.mime === "image/webp" ? "webp" : "jpg";
  }
  return { data, kind: sniffed.kind, mime, ext, sha256: sha256Hex(data), width, height };
}

/** Square 512x512 WebP avatar / logo with metadata stripped. */
export async function processSquareImage(input: Buffer): Promise<ProcessedFile> {
  if (input.length > AVATAR_MAX_BYTES) throw new AppError("Images can be up to 2 MB.");
  const sniffed = sniffFileType(input);
  if (!sniffed || sniffed.kind !== "image") throw new AppError("Please upload a JPG, PNG or WebP image.");
  let data: Buffer;
  try {
    data = await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(512, 512, { fit: "cover", position: "attention" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AppError("That image could not be read. Please try another one.");
  }
  await assertImageAllowed(data, "image/webp", "This image");
  return { data, kind: "image", mime: "image/webp", ext: "webp", sha256: sha256Hex(data), width: 512, height: 512 };
}

export interface FinalisedFile {
  storagePath: string;
  originalName: string;
  contentType: string;
  kind: FileKind;
  size: number;
  sha256: string;
  width: number | null;
  height: number | null;
}

/**
 * Finalise step: reads each quarantined upload, verifies and re-encodes it,
 * stores the clean copy under files/{postId}/ and deletes the quarantine copy.
 * If anything fails, every file involved is deleted and an error is thrown.
 */
export async function finaliseUploads(
  actor: Actor,
  postId: string,
  uploads: { pathname: string; name: string }[],
  opts: { comment?: boolean; dm?: boolean; firstPosition?: number; folder?: string } = {},
): Promise<FinalisedFile[]> {
  const settings = await getSettings();
  // DM images are allowed even if the admin turned images off for posts: they're private.
  const kinds = opts.dm
    ? DM_FILE_KINDS
    : opts.comment
      ? settings.enabledFileKinds.filter((k) => COMMENT_FILE_KINDS.includes(k))
      : settings.enabledFileKinds;
  const folder = opts.folder ?? `files/${postId}`;
  const store = storage();
  const written: string[] = [];
  const out: FinalisedFile[] = [];
  try {
    for (const [i, u] of uploads.entries()) {
      if (!u.pathname.startsWith(quarantinePrefixFor(actor.id)) || u.pathname.includes("..")) {
        throw new ForbiddenError("Invalid upload.");
      }
      const name = safeFileName(u.name);
      await assertClean(name.replace(/\.[a-z0-9]+$/i, ""));
      const bytes = await store.readAll(u.pathname, 50 * MB + 1);
      if (!bytes) throw new AppError(`"${name}" could not be found or is too large. Please upload it again.`);
      if (opts.comment && bytes.length > COMMENT_FILE_MAX_BYTES) throw new AppError(`"${name}" is too large for a comment.`);
      if (opts.dm && bytes.length > DM_FILE_MAX_BYTES) throw new AppError(`"${name}" is too large for a message.`);
      const p = await processFileBytes(bytes, name, kinds);
      // DM image names don't reveal the content hash, and the bytes are encrypted at rest.
      const storagePath = opts.dm
        ? `${folder}/${i + (opts.firstPosition ?? 0)}-${randomUUID()}.bin`
        : `${folder}/${i + (opts.firstPosition ?? 0)}-${p.sha256.slice(0, 16)}.${p.ext}`;
      await store.put(storagePath, opts.dm ? encryptBytes(env.sessionSecret, p.data) : p.data, opts.dm ? "application/octet-stream" : p.mime);
      written.push(storagePath);
      out.push({
        storagePath,
        originalName: name,
        contentType: p.mime,
        kind: p.kind,
        size: p.data.length,
        sha256: p.sha256,
        width: p.width,
        height: p.height,
      });
    }
  } catch (err) {
    await store.delete(written).catch(() => {});
    throw err;
  } finally {
    // Quarantine copies are always removed (failed files are deleted immediately).
    await store.delete(uploads.map((u) => u.pathname).filter((p) => p.startsWith(quarantinePrefixFor(actor.id)))).catch(() => {});
  }
  return out;
}
