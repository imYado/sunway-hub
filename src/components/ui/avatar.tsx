/** Profile picture, or a flat grey initials avatar. Images are served only through the authenticated file route. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({
  userId,
  name,
  hasImage,
  pending = false,
  size = 40,
}: {
  userId: string;
  name: string | null | undefined;
  hasImage: boolean;
  pending?: boolean;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (hasImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/files/avatar/${userId}${pending ? "?pending=1" : ""}`}
        alt={`Profile picture of ${name ?? "member"}`}
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
      style={{ ...style, fontSize: Math.max(12, size / 3) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-skeleton font-semibold text-ink"
    >
      {initials(name)}
    </span>
  );
}
