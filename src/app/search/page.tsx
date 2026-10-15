import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { ClubLogo } from "@/components/club-logo";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { Avatar } from "@/components/ui/avatar";
import { Pagination, PostList } from "@/components/posts/post-card";
import { POST_TYPES, semesterOptions } from "@/lib/rules";
import { requireMember } from "@/server/actor";
import { listClubs, type ClubCard } from "@/server/dal/clubs";
import { parseType } from "@/components/posts/feed-controls";
import { listSubjects, parseSort, searchPosts, type SearchFilters } from "@/server/dal/posts";
import { searchUsers, type UserResult } from "@/server/dal/users";

export const metadata: Metadata = { title: "Search" };

type Tab = "all" | "posts" | "market" | "clubs" | "people";
const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "posts", label: "Posts" },
  { value: "market", label: "Market" },
  { value: "clubs", label: "Clubs" },
  { value: "people", label: "People" },
];

type SP = { q?: string; tab?: string; type?: string; subject?: string; semester?: string; teacher?: string; club?: string; sort?: string; page?: string };

function PeopleList({ people }: { people: UserResult[] }) {
  return (
    <ul className="divide-y divide-line rounded border border-line">
      {people.map((u) => (
        <li key={u.id}>
          <Link href={`/u/${u.username}`} className="flex items-center gap-3 p-3 text-ink hover:bg-surface hover:no-underline">
            <Avatar userId={u.id} name={u.displayName ?? u.username} hasImage={u.hasAvatar} decorative size={44} />
            <span className="min-w-0">
              <span className="block font-medium">@{u.username}</span>
              {u.displayName && <span className="block truncate text-sm text-muted">{u.displayName}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ClubList({ clubs }: { clubs: ClubCard[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {clubs.map((c) => (
        <li key={c.id}>
          <Link href={`/clubs/${c.slug}`} className="card flex h-full items-center gap-3 p-3 text-ink hover:bg-surface hover:no-underline">
            <ClubLogo clubId={c.id} name={c.name} hasLogo={!!c.logoFileId} size={44} />
            <span className="min-w-0">
              <span className="block font-medium">{c.name}</span>
              <span className="block text-sm text-muted">{c.category}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, more, children }: { title: string; more?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8" aria-label={title}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {more && (
          <Link href={more} className="text-sm">
            See all
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireMember({ guestOk: true });
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 100) ?? "";
  const tab: Tab = TABS.some((t) => t.value === sp.tab) ? (sp.tab as Tab) : "all";
  const page = Number(sp.page ?? "1") || 1;
  const tabHref = (t: Tab) => `/search?${new URLSearchParams(Object.entries({ q, tab: t === "all" ? "" : t }).filter(([, v]) => v) as [string, string][])}`;

  const postFilters: SearchFilters = {
    q: q || undefined,
    type: parseType(sp.type),
    excludeTypes: ["market"],
    subject: sp.subject || undefined,
    semester: sp.semester || undefined,
    verifiedTeacher: sp.teacher === "1",
    club: sp.club || undefined,
    // With a search term and no sort chosen, results are ranked by relevance.
    sort: sp.sort ? parseSort(sp.sort, "new") : q ? undefined : "new",
    page,
  };
  if (postFilters.type === "market") postFilters.type = undefined;
  const marketFilters: SearchFilters = { q: q || undefined, type: "market", sort: sp.sort ? parseSort(sp.sort, "new") : q ? undefined : "new", page };

  const wants = (t: Tab) => tab === t || (tab === "all" && !!q);
  const [posts, market, clubs, people, subjects, allClubs] = await Promise.all([
    wants("posts") ? searchPosts(actor, postFilters) : null,
    wants("market") ? searchPosts(actor, marketFilters) : null,
    wants("clubs") && q ? listClubs(actor, { q }) : null,
    wants("people") && q ? searchUsers(actor, q, tab === "people" ? 50 : 6) : null,
    tab === "posts" ? listSubjects() : [],
    tab === "posts" ? listClubs(actor) : [],
  ]);
  const params = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "page" && v) as [string, string][]);

  return (
    <div>
      <PageTitle>Search</PageTitle>
      <form method="get" role="search" className="mb-4">
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        <label htmlFor="q" className="sr-only">
          Search posts, market listings, clubs and people
        </label>
        <div className="relative">
          <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={100}
            enterKeyHint="search"
            className="input rounded-full pl-11"
            placeholder="Search posts, market, clubs and people"
          />
        </div>
      </form>
      <nav aria-label="Search in" className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <Link key={t.value} href={tabHref(t.value)} className={`btn btn-sm shrink-0 ${tab === t.value ? "btn-primary" : ""}`} aria-current={tab === t.value ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "all" && !q && <EmptyState title="Search SJ Study">Type something to find posts, market listings, clubs and people. People are found by their username.</EmptyState>}

      {tab === "all" && q && (
        <>
          {people && people.length > 0 && (
            <Section title="People" more={tabHref("people")}>
              <PeopleList people={people} />
            </Section>
          )}
          {clubs && clubs.length > 0 && (
            <Section title="Clubs" more={tabHref("clubs")}>
              <ClubList clubs={clubs.slice(0, 4)} />
            </Section>
          )}
          {posts && posts.items.length > 0 && (
            <Section title="Posts" more={tabHref("posts")}>
              <PostList posts={posts.items.slice(0, 5)} empty={null} />
            </Section>
          )}
          {market && market.items.length > 0 && (
            <Section title="Market" more={tabHref("market")}>
              <PostList posts={market.items.slice(0, 5)} empty={null} />
            </Section>
          )}
          {!people?.length && !clubs?.length && !posts?.items.length && !market?.items.length && (
            <EmptyState title="Nothing found">Try fewer or different words.</EmptyState>
          )}
        </>
      )}

      {tab === "people" &&
        (!q ? (
          <EmptyState title="Find people">Search by username, for example @alice.</EmptyState>
        ) : people && people.length > 0 ? (
          <PeopleList people={people} />
        ) : (
          <EmptyState title="No one found">People are found by their username only.</EmptyState>
        ))}

      {tab === "clubs" &&
        (!q ? (
          <EmptyState title="Find clubs">
            Type a club&apos;s name, or <Link href="/clubs">browse all clubs</Link>.
          </EmptyState>
        ) : clubs && clubs.length > 0 ? (
          <ClubList clubs={clubs} />
        ) : (
          <EmptyState title="No clubs found">Try another name.</EmptyState>
        ))}

      {tab === "market" && market && (
        <>
          <PostList posts={market.items} empty={<EmptyState title="No listings found">Try other words.</EmptyState>} />
          <Pagination page={market.page} pages={market.pages} makeHref={(p) => `/search?${params.toString()}&page=${p}`} />
        </>
      )}

      {tab === "posts" && posts && (
        <>
          <details className="card mb-6 p-4" open={!!(sp.type || sp.subject || sp.semester || sp.club || sp.teacher || sp.sort)}>
            <summary className="cursor-pointer font-medium">Filters</summary>
            <form method="get" className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <input type="hidden" name="tab" value="posts" />
              <input type="hidden" name="q" value={q} />
              <div>
                <label htmlFor="type" className="label">
                  Type
                </label>
                <select id="type" name="type" defaultValue={sp.type ?? ""} className="input">
                  <option value="">Any</option>
                  {POST_TYPES.filter((t) => t.value !== "market").map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="subject" className="label">
                  Tag
                </label>
                <select id="subject" name="subject" defaultValue={sp.subject ?? ""} className="input">
                  <option value="">Any</option>
                  {subjects.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="semester" className="label">
                  Semester
                </label>
                <select id="semester" name="semester" defaultValue={sp.semester ?? ""} className="input">
                  <option value="">Any</option>
                  {semesterOptions().map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="club" className="label">
                  Club
                </label>
                <select id="club" name="club" defaultValue={sp.club ?? ""} className="input">
                  <option value="">Any</option>
                  {allClubs.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sort" className="label">
                  Sort by
                </label>
                <select id="sort" name="sort" defaultValue={sp.sort ? parseSort(sp.sort, "new") : ""} className="input">
                  <option value="">{q ? "Best match" : "New"}</option>
                  <option value="new">New</option>
                  <option value="hot">Hot</option>
                  <option value="top">Top</option>
                </select>
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="teacher" value="1" defaultChecked={sp.teacher === "1"} className="h-4 w-4" />
                Verified teachers only
              </label>
              <div className="sm:col-span-2 lg:col-span-3">
                <button type="submit" className="btn btn-primary">
                  Apply filters
                </button>
              </div>
            </form>
          </details>
          <p className="mb-4 text-sm text-muted" role="status">
            {posts.total} result{posts.total === 1 ? "" : "s"}
          </p>
          <PostList posts={posts.items} empty={<EmptyState title="No posts found">Try fewer words or remove a filter.</EmptyState>} />
          <Pagination page={posts.page} pages={posts.pages} makeHref={(p) => `/search?${params.toString()}&page=${p}`} />
        </>
      )}
    </div>
  );
}
