import { User } from "lucide-react";

/** Profile picture, a coloured initials circle, or a grey silhouette for anonymous posters. Images are served only through the authenticated file route. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// Dark enough that white text passes WCAG AA (4.5:1) on every one of them.
const AVATAR_COLOURS = ["#1D4ED8", "#047857", "#7C3AED", "#B45309", "#BE185D", "#0E7490", "#4338CA", "#9D174D"];

/** The same person always gets the same colour. */
export function avatarColour(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLOURS[h % AVATAR_COLOURS.length];
}

export function Avatar({
  userId,
  name,
  hasImage,
  pending = false,
  anonymous = false,
  decorative = false,
  size = 40,
}: {
  userId: string;
  name: string | null | undefined;
  hasImage: boolean;
  pending?: boolean;
  /** Shown for anonymous posters: a grey circle with a silhouette. */
  anonymous?: boolean;
  /** Set when the name is already written next to it, so screen readers don't hear it twice. */
  decorative?: boolean;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (anonymous || !userId) {
    return (
      <span
        aria-hidden="true"
        style={style}
        className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-skeleton text-muted"
      >
        <User size={Math.round(size * 0.6)} strokeWidth={2} />
      </span>
    );
  }
  if (hasImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/files/avatar/${userId}${pending ? "?pending=1" : ""}`}
        alt={decorative ? "" : `Profile picture of ${name ?? "member"}`}
        width={size}
        height={size}
        style={style}
        className="shrink-0 rounded-full border border-line bg-surface object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.4)), backgroundColor: avatarColour(userId), color: "#FFFFFF" }}
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold"
    >
      {initials(name)}
    </span>
  );
}
