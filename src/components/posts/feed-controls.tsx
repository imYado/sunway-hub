import Link from "next/link";
import { POST_TYPES, type PostType } from "@/lib/rules";
import type { PostSort } from "@/server/dal/posts";

const SORTS: { value: PostSort; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "new", label: "New" },
  { value: "top", label: "Top" },
];

const TYPE_FILTER_LABEL: Record<PostType, string> = { discussion: "Discussions", study: "Notes", event: "Events", club: "Clubs", market: "Market" };

/** Type filter and Hot / New / Top sort, as links so they work without JavaScript. */
export function FeedControls({
  base,
  type,
  sort,
  extra = {},
  showTypes = true,
  types = POST_TYPES,
}: {
  base: string;
  type?: PostType;
  sort: PostSort;
  extra?: Record<string, string | undefined>;
  showTypes?: boolean;
  types?: readonly { value: PostType; label: string }[];
}) {
  const href = (t: PostType | undefined, s: PostSort) => {
    const p = new URLSearchParams(Object.entries({ ...extra, type: t, sort: s }).filter(([, v]) => v) as [string, string][]);
    const q = p.toString();
    return q ? `${base}?${q}` : base;
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {showTypes && (
        <nav aria-label="Post type" className="flex flex-wrap gap-2">
          <Link href={href(undefined, sort)} className={`btn btn-sm ${!type ? "btn-primary" : ""}`} aria-current={!type ? "page" : undefined}>
            All
          </Link>
          {types.map((t) => (
            <Link
              key={t.value}
              href={href(t.value, sort)}
              className={`btn btn-sm ${type === t.value ? "btn-primary" : ""}`}
              aria-current={type === t.value ? "page" : undefined}
            >
              {TYPE_FILTER_LABEL[t.value]}
            </Link>
          ))}
        </nav>
      )}
      <nav aria-label="Sort" className="ml-auto flex gap-2">
        {SORTS.map((s) => (
          <Link key={s.value} href={href(type, s.value)} className={`btn btn-sm ${sort === s.value ? "btn-primary" : ""}`} aria-current={sort === s.value ? "page" : undefined}>
            {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function parseType(raw: string | undefined): PostType | undefined {
  return POST_TYPES.some((t) => t.value === raw) ? (raw as PostType) : undefined;
}
