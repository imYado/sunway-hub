import "server-only";
import { env } from "@/lib/env";
import { localStorageDriver } from "./local";
import { vercelBlobDriver } from "./vercel-blob";

/**
 * File storage. Production: Vercel Blob with a PRIVATE store (never public).
 * Bytes are only ever served through /api/files/... after an authorisation check.
 * Development/tests can use STORAGE_DRIVER=local (files under .data/blob).
 */
export interface StoredObjectInfo {
  pathname: string;
  size: number;
  uploadedAt: Date;
}

export interface GetResult {
  stream: ReadableStream<Uint8Array>;
  size: number | null;
  status: 200 | 206;
  contentRange?: string | null;
}

export interface StorageDriver {
  put(pathname: string, data: Buffer, contentType: string): Promise<void>;
  get(pathname: string, range?: string | null): Promise<GetResult | null>;
  readAll(pathname: string, maxBytes: number): Promise<Buffer | null>;
  delete(pathnames: string[]): Promise<void>;
  list(prefix: string): Promise<StoredObjectInfo[]>;
}

export function storage(): StorageDriver {
  return env.storageDriver === "local" ? localStorageDriver : vercelBlobDriver;
}

export async function streamToBuffer(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Buffer | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
