import "server-only";
import { AppError } from "./errors";

/**
 * Optional image-moderation adapter, disabled by default.
 *
 * Images and videos can't be word-filtered, so they rely on admin approval and
 * reports. To add an automated check later, implement `ImageModerator` (for
 * example, a call to a moderation API) and return it from `getModerator()`.
 * Any new provider receives user images, so it must be added to the Privacy
 * Policy and README before it is switched on.
 */
export interface ImageModerator {
  /** Returns "block" to refuse the image, "allow" otherwise. Never throws for a clean image. */
  check(image: Buffer, mime: string): Promise<"allow" | "block">;
}

function getModerator(): ImageModerator | null {
  // No provider is configured. Admin approval is the only image check.
  return null;
}

export async function assertImageAllowed(image: Buffer, mime: string, name: string): Promise<void> {
  const moderator = getModerator();
  if (!moderator) return;
  if ((await moderator.check(image, mime)) === "block") {
    throw new AppError(`"${name}" can't be uploaded because it may break the Community Guidelines.`);
  }
}
