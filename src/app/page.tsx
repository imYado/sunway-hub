import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { FeedControls, parseType } from "@/components/posts/feed-controls";
import { HOME_POST_TYPES } from "@/lib/rules";
import { Pagination, PostList } from "@/components/posts/post-card";
import { requireMember } from "@/server/actor";
import { listFeed, parseSort } from "@/server/dal/posts";

type SP = { page?: string; type?: string; sort?: string };

export default function HomePage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Feed searchParams={searchParams} />
    </Suspense>
  );
}

async function Feed({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireMember({ guestOk: true });
  const sp = await searchParams;
  const page = Number(sp.page ?? "1") || 1;
  const parsed = parseType(sp.type);
  const type = parsed === "market" ? undefined : parsed;
  const sort = parseSort(sp.sort, "hot");
  const feed = await listFeed(actor, { page, type, sort });
  const params = new URLSearchParams(Object.entries({ type, sort }).filter(([, v]) => v) as [string, string][]);
  return (
    <div>
      <PageTitle
        actions={
          <Link href={type ? `/posts/new?type=${type}` : "/posts/new"} className="btn btn-primary">
            New post
          </Link>
        }
      >
        Home
      </PageTitle>
      <FeedControls base="/" type={type} sort={sort} types={HOME_POST_TYPES} />
      <PostList
        posts={feed.items}
        path="/"
        empty={
          <EmptyState title="Nothing here yet">
            Be the first to <Link href="/posts/new">post something</Link>.
          </EmptyState>
        }
      />
      <Pagination page={feed.page} pages={feed.pages} makeHref={(p) => `/?${params.toString()}&page=${p}`} />
    </div>
  );
}
