"use client";

import { upload } from "@vercel/blob/client";
import { safeFileName } from "@/lib/files";

/** Uploads one file into the member's quarantine folder. The server checks and moves it when the form is submitted. */
export async function uploadToQuarantine(
  file: File,
  userId: string,
  driver: "vercel" | "local",
  purpose: "post" | "comment" = "post",
): Promise<{ pathname: string; name: string }> {
  const name = safeFileName(file.name);
  const pathname = `quarantine/${userId}/${name.replace(/[^A-Za-z0-9._-]+/g, "_")}`;
  if (driver === "local") {
    const fd = new FormData();
    fd.set("file", file);
    fd.set("pathname", pathname);
    fd.set("purpose", purpose);
    const res = await fetch("/api/uploads/local", { method: "POST", body: fd });
    const json = (await res.json()) as { pathname?: string; error?: string };
    if (!res.ok || !json.pathname) throw new Error(json.error ?? "Upload failed.");
    return { pathname: json.pathname, name };
  }
  const result = await upload(pathname, file, {
    access: "private",
    handleUploadUrl: "/api/uploads/authorize",
    clientPayload: JSON.stringify({ name, size: file.size, contentType: file.type, purpose }),
    contentType: file.type,
    multipart: file.size > 8 * 1024 * 1024,
  });
  return { pathname: result.pathname, name };
}
