import { initials } from "@/components/ui/avatar";

export function ClubLogo({ clubId, name, hasLogo, size = 48, pending = false }: { clubId: string; name: string; hasLogo: boolean; size?: number; pending?: boolean }) {
  if (hasLogo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/files/club-logo/${clubId}${pending ? "?pending=1" : ""}`}
        alt={`${name} logo`}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded border border-line bg-surface object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.max(12, size / 3) }}
      className="inline-flex shrink-0 items-center justify-center rounded border border-line bg-skeleton font-semibold"
    >
      {initials(name)}
    </span>
  );
}
