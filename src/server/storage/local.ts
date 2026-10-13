import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { StorageDriver, StoredObjectInfo } from "./index";

// Development/test-only storage on the local disk. Never used in production.
const ROOT = path.join(process.cwd(), ".data", "blob");

function resolve(pathname: string): string {
  const full = path.resolve(ROOT, pathname);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Invalid storage path");
  return full;
}

function parseRange(range: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) return null;
  let start = m[1] ? Number(m[1]) : NaN;
  let end = m[2] ? Number(m[2]) : size - 1;
  if (Number.isNaN(start)) {
    start = Math.max(0, size - end);
    end = size - 1;
  }
  if (start > end || end >= size) return null;
  return { start, end };
}

export const localStorageDriver: StorageDriver = {
  async put(pathname, data) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== "1") {
      throw new Error("Local storage is for development only");
    }
    const full = resolve(pathname);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  },
  async get(pathname, range) {
    const full = resolve(pathname);
    let info;
    try {
      info = await stat(full);
    } catch {
      return null;
    }
    const r = range ? parseRange(range, info.size) : null;
    const node = r ? createReadStream(full, { start: r.start, end: r.end }) : createReadStream(full);
    return {
      stream: Readable.toWeb(node) as ReadableStream<Uint8Array>,
      size: r ? r.end - r.start + 1 : info.size,
      status: r ? 206 : 200,
      contentRange: r ? `bytes ${r.start}-${r.end}/${info.size}` : null,
    };
  },
  async readAll(pathname, maxBytes) {
    try {
      const full = resolve(pathname);
      const info = await stat(full);
      if (info.size > maxBytes) return null;
      return await readFile(full);
    } catch {
      return null;
    }
  },
  async delete(pathnames) {
    for (const p of pathnames) await rm(resolve(p), { force: true });
  },
  async list(prefix) {
    const out: StoredObjectInfo[] = [];
    async function walk(dir: string) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else {
          const rel = path.relative(ROOT, full).split(path.sep).join("/");
          if (rel.startsWith(prefix)) {
            const s = await stat(full);
            out.push({ pathname: rel, size: s.size, uploadedAt: s.mtime });
          }
        }
      }
    }
    await walk(ROOT);
    return out;
  },
};
