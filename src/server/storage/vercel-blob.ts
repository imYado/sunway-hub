import "server-only";
import { del, get, list, put } from "@vercel/blob";
import type { StorageDriver, StoredObjectInfo } from "./index";
import { streamToBuffer } from "./index";

export const vercelBlobDriver: StorageDriver = {
  async put(pathname, data, contentType) {
    await put(pathname, data, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true });
  },
  async get(pathname, range) {
    const res = await get(pathname, { access: "private", useCache: false, headers: range ? { Range: range } : undefined });
    if (!res || !res.stream) return null;
    const contentRange = res.headers.get("content-range");
    return {
      stream: res.stream,
      size: Number(res.headers.get("content-length")) || res.blob.size,
      status: contentRange ? 206 : 200,
      contentRange,
    };
  },
  async readAll(pathname, maxBytes) {
    const res = await get(pathname, { access: "private", useCache: false });
    if (!res || !res.stream) return null;
    return streamToBuffer(res.stream, maxBytes);
  },
  async delete(pathnames) {
    if (pathnames.length === 0) return;
    for (let i = 0; i < pathnames.length; i += 100) {
      await del(pathnames.slice(i, i + 100));
    }
  },
  async list(prefix) {
    const out: StoredObjectInfo[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      for (const b of page.blobs) out.push({ pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt });
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return out;
  },
};
