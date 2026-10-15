import type { Metadata } from "next";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { Pagination, PostList } from "@/components/posts/post-card";
import { POST_TYPES, semesterOptions } from "@/lib/rules";
import { requireMember } from "@/server/actor";
import { listClubs } from "@/server/dal/clubs";
import { parseType } from "@/components/posts/feed-controls";
import { listSubjects, parseSort, searchPosts, type SearchFilters } from "@/server/dal/posts";

export const metadata: Metadata = { title: "Search" };

type SP = { q?: string; type?: string; subject?: string; semester?: string; teacher?: string; club?: string; sort?: string; page?: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireMember();
  const sp = await searchParams;
  const filters: SearchFilters = {
    q: sp.q?.slice(0, 100),
    type: parseType(sp.type),
    subject: sp.subject || undefined,
    semester: sp.semester || undefined,
    verifiedTeacher: sp.teacher === "1",
    club: sp.club || undefined,
    // With a search term and no sort chosen, results are ranked by relevance.
    sort: sp.sort ? parseSort(sp.sort, "new") : sp.q ? undefined : "new",
    page: Number(sp.page ?? "1") || 1,
  };
  const [results, subjects, clubs] = await Promise.all([searchPosts(actor, filters), listSubjects(), listClubs(actor)]);
  const params = new URLSearchParams(Object.entries(sp).filter(([k, v]) => k !== "page" && v) as [string, string][]);
  const hasQuery = Object.entries(filters).some(([k, v]) => v && k !== "sort" && k !== "page");

  return (
    <div>
      <PageTitle>Search</PageTitle>
      <form method="get" className="card mb-6 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3" role="search">
        <div className="sm:col-span-2 lg:col-span-3">
          <label htmlFor="q" className="label">
            Search
          </label>
          <input id="q" name="q" type="search" defaultValue={sp.q} className="input" placeholder="Titles, tags, descriptions" />
        </div>
        <div>
          <label htmlFor="type" className="label">
            Type
          </label>
          <select id="type" name="type" defaultValue={sp.type ?? ""} className="input">
            <option value="">Any</option>
            {POST_TYPES.map((t) => (
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
            {clubs.map((c) => (
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
            <option value="">{sp.q ? "Best match" : "New"}</option>
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
            Search
          </button>
        </div>
      </form>
      {hasQuery && (
        <p className="mb-4 text-sm text-muted" role="status">
          {results.total} result{results.total === 1 ? "" : "s"}
        </p>
      )}
      <PostList posts={results.items} empty={<EmptyState title="No posts found">Try fewer words or remove a filter.</EmptyState>} />
      <Pagination page={results.page} pages={results.pages} makeHref={(p) => `/search?${params.toString()}&page=${p}`} />
    </div>
  );
}
