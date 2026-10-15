import { NextResponse, type NextRequest } from "next/server";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getActor } from "@/server/actor";
import { isSameOrigin } from "@/server/csrf";
import { AppError } from "@/server/errors";
import { authorizeUpload } from "@/server/dal/uploads";
import { storage } from "@/server/storage";

/** Development/test stand-in for Vercel Blob client uploads (STORAGE_DRIVER=local only). */
export async function POST(req: NextRequest) {
  if (env.storageDriver !== "local") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Bad request" }, { status: 403 });
  const actor = await getActor();
  if (!actor || !actor.onboarded) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file");
  const pathname = String(form.get("pathname") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  try {
    const raw = form.get("purpose");
    const purpose = raw === "comment" || raw === "dm" ? raw : "post";
    await authorizeUpload(actor, { pathname, name: file.name, contentType: file.type, size: file.size }, purpose);
    const finalPath = `${pathname}-${randomToken(6)}`;
    await storage().put(finalPath, Buffer.from(await file.arrayBuffer()), file.type);
    return NextResponse.json({ pathname: finalPath });
  } catch (err) {
    const message = err instanceof AppError ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: err instanceof AppError ? err.status : 400 });
  }
}
