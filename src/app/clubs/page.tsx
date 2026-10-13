import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { CLUB_CATEGORIES } from "@/lib/rules";
import { requireMember } from "@/server/actor";
import { listClubs } from "@/server/dal/clubs";
import { ClubLogo } from "@/components/club-logo";

export const metadata: Metadata = { title: "Clubs" };

export default async function ClubsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const actor = await requireMember();
  const sp = await searchParams;
  const clubs = await listClubs(actor, { q: sp.q, category: sp.category });
  return (
    <div>
      <PageTitle>Clubs and societies</PageTitle>
      <form method="get" role="search" className="card mb-6 grid gap-4 p-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor="q" className="label">
            Search clubs
          </label>
          <input id="q" name="q" type="search" defaultValue={sp.q} className="input" />
        </div>
        <div>
          <label htmlFor="category" className="label">
            Category
          </label>
          <select id="category" name="category" defaultValue={sp.category ?? ""} className="input">
            <option value="">All categories</option>
            {CLUB_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3">
          <button type="submit" className="btn btn-primary">
            Filter
          </button>
        </div>
      </form>
      {clubs.length === 0 ? (
        <EmptyState title="No clubs found">{actor.isAdmin ? <Link href="/admin/clubs">Import Sunway clubs in the admin panel.</Link> : "Try another search."}</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((c) => (
            <li key={c.id}>
              <Link href={`/clubs/${c.slug}`} className="card flex h-full gap-3 p-4 text-ink hover:bg-surface hover:no-underline">
                <ClubLogo clubId={c.id} name={c.name} hasLogo={!!c.logoFileId} size={48} />
                <span className="min-w-0">
                  <span className="block font-medium">{c.name}</span>
                  <span className="mt-1 block text-sm text-muted">{c.category}</span>
                  {c.unclaimed && <span className="badge mt-2 text-sm">Unclaimed</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
