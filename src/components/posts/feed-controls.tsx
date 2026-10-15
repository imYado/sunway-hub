import Link from "next/link";
import { POST_TYPES, type PostType } from "@/lib/rules";
import type { PostSort } from "@/server/dal/posts";
import { SortMenu } from "./sort-menu";

const SORTS: { value: PostSort; label: string; hint: string }[] = [
  { value: "hot", label: "Hot", hint: "Popular right now" },
  { value: "new", label: "New", hint: "Newest first" },
  { value: "top", label: "Top", hint: "Most upvoted of all time" },
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
      <div className="ml-auto">
        <SortMenu current={sort} options={SORTS.map((s) => ({ ...s, href: href(type, s.value) }))} />
      </div>
    </div>
  );
}

export function parseType(raw: string | undefined): PostType | undefined {
  return POST_TYPES.some((t) => t.value === raw) ? (raw as PostType) : undefined;
}
