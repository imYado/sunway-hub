import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { PageSearch } from "@/components/ui/page-search";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { FeedControls } from "@/components/posts/feed-controls";
import { Pagination, PostList } from "@/components/posts/post-card";
import { MARKET_KINDS, type MarketKind } from "@/lib/rules";
import { requireMember } from "@/server/actor";
import { listMarket, parseSort } from "@/server/dal/posts";

export const metadata: Metadata = { title: "Market" };

type SP = { page?: string; kind?: string; sort?: string; q?: string };

export default function MarketPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Market searchParams={searchParams} />
    </Suspense>
  );
}

async function Market({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireMember({ guestOk: true });
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const kind = MARKET_KINDS.some((k) => k.value === sp.kind) ? (sp.kind as MarketKind) : undefined;
  const sort = parseSort(sp.sort, "new");
  const q = sp.q?.trim().slice(0, 100) || undefined;
  const feed = await listMarket(actor, { page, kind, sort, q });
  const href = (k: MarketKind | undefined) => {
    const p = new URLSearchParams(Object.entries({ kind: k, sort, q }).filter(([, v]) => v) as [string, string][]);
    return p.size ? `/market?${p}` : "/market";
  };
  const params = new URLSearchParams(Object.entries({ kind, sort, q }).filter(([, v]) => v) as [string, string][]);
  return (
    <div>
      <PageTitle
        actions={
          <Link href="/posts/new?type=market" className="btn btn-primary">
            New listing
          </Link>
        }
      >
        Market
      </PageTitle>
      <p className="mb-4 text-muted">Buy, sell, swap or borrow things with other members. Message the poster to arrange the details.</p>
      <PageSearch action="/market" label="Search the market" placeholder="Search the market" defaultValue={q} keep={{ kind, sort: sp.sort }} />
      <nav aria-label="Listing type" className="mb-2 flex flex-wrap gap-2">
        <Link href={href(undefined)} className={`btn btn-sm ${!kind ? "btn-primary" : ""}`} aria-current={!kind ? "page" : undefined}>
          All
        </Link>
        {MARKET_KINDS.map((k) => (
          <Link key={k.value} href={href(k.value)} className={`btn btn-sm ${kind === k.value ? "btn-primary" : ""}`} aria-current={kind === k.value ? "page" : undefined}>
            {k.label}
          </Link>
        ))}
      </nav>
      <FeedControls base="/market" sort={sort} extra={{ kind, q }} showTypes={false} />
      <PostList
        posts={feed.items}
        path="/market"
        empty={
          q ? (
            <EmptyState title="No listings found">Try other words.</EmptyState>
          ) : (
            <EmptyState title="No listings yet">
              <Link href="/posts/new?type=market">Post the first one</Link>.
            </EmptyState>
          )
        }
      />
      <Pagination page={feed.page} pages={feed.pages} makeHref={(p) => `/market?${params.toString()}&page=${p}`} />
    </div>
  );
}
