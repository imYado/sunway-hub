import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/layout/page-skeleton";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { Pagination, PostList } from "@/components/posts/post-card";
import { requireMember } from "@/server/actor";
import { listFeed } from "@/server/dal/posts";

export default function HomePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Feed searchParams={searchParams} />
    </Suspense>
  );
}

async function Feed({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await requireMember();
  const page = Number((await searchParams).page ?? "1") || 1;
  const feed = await listFeed(actor, page);
  return (
    <div>
      <PageTitle
        actions={
          <Link href="/posts/new" className="btn btn-primary">
            Share notes
          </Link>
        }
      >
        Latest
      </PageTitle>
      <PostList
        posts={feed.items}
        empty={
          <EmptyState title="Nothing here yet">
            Be the first to <Link href="/posts/new">share your notes</Link>. Every post is checked by the admin before it appears.
          </EmptyState>
        }
      />
      <Pagination page={feed.page} pages={feed.pages} makeHref={(p) => `/?page=${p}`} />
    </div>
  );
}
