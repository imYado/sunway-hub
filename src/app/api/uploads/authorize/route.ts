import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getActor } from "@/server/actor";
import { isSameOrigin } from "@/server/csrf";
import { AppError } from "@/server/errors";
import { authorizeUpload } from "@/server/dal/uploads";

const payloadSchema = z.object({
  name: z.string().min(1).max(200),
  size: z.number().int().positive(),
  contentType: z.string().max(200),
  purpose: z.enum(["post", "comment"]).default("post"),
});

/**
 * Step 1 of a Vercel Blob CLIENT upload: the browser asks for a short-lived token.
 * We check the session, quotas, storage cap, type and size, and only allow paths
 * under quarantine/{userId}/ in the PRIVATE store.
 */
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Bad request" }, { status: 403 });
  const actor = await getActor();
  if (!actor || !actor.onboarded) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const body = (await req.json()) as HandleUploadBody;
  if (body.type !== "blob.generate-client-token") {
    // We do not use upload-completed webhooks: files are finalised when the post is submitted.
    return NextResponse.json({ error: "Not supported" }, { status: 400 });
  }
  try {
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = payloadSchema.parse(JSON.parse(clientPayload ?? "{}"));
        const rules = await authorizeUpload(
          actor,
          { pathname, name: payload.name, contentType: payload.contentType, size: payload.size },
          payload.purpose,
        );
        return {
          allowedContentTypes: rules.allowedContentTypes,
          maximumSizeInBytes: rules.maxBytes,
          addRandomSuffix: true,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60_000,
          tokenPayload: JSON.stringify({ userId: actor.id }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof AppError ? err.message : err instanceof z.ZodError ? "Invalid upload." : "Upload could not be authorised.";
    const status = err instanceof AppError ? err.status : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
