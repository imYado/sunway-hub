import "server-only";
import { storage } from "./storage";

function contentDisposition(kind: "inline" | "attachment", name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Streams a private Blob object to an already-authorised viewer. Raw storage paths
 * are never exposed. Only re-encoded images and MP4 video are shown inline; every
 * other file is a download with nosniff and a sandbox CSP.
 */
export async function fileResponse(
  file: { storagePath: string; contentType: string; originalName: string; kind: string; size: number },
  opts: { download?: boolean; range?: string | null; cacheSeconds?: number } = {},
): Promise<Response> {
  const inline = !opts.download && (file.kind === "image" || file.kind === "video");
  const obj = await storage().get(file.storagePath, file.kind === "video" ? opts.range : null);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": file.contentType,
    "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", file.originalName),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
    "Cache-Control": `private, max-age=${opts.cacheSeconds ?? 300}`,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Accept-Ranges": file.kind === "video" ? "bytes" : "none",
  });
  if (obj.size) headers.set("Content-Length", String(obj.size));
  if (obj.contentRange) headers.set("Content-Range", obj.contentRange);
  return new Response(obj.stream, { status: obj.status, headers });
}
