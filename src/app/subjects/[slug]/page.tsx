import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { Pagination, PostList } from "@/components/posts/post-card";
import { followSubjectAction } from "@/app/actions/posts";
import { requireMember } from "@/server/actor";
import { isFollowingSubject } from "@/server/dal/clubs";
import { getSubject, searchPosts, semestersForSubject } from "@/server/dal/posts";

export const metadata: Metadata = { title: "Subject" };

export default async function SubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ semester?: string; sort?: string; page?: string }>;
}) {
  const actor = await requireMember();
  const { slug } = await params;
  const sp = await searchParams;
  const subject = await getSubject(slug);
  if (!subject) notFound();
  const [semesters, following, results] = await Promise.all([
    semestersForSubject(subject.id),
    isFollowingSubject(actor, subject.id),
    searchPosts(actor, { subject: slug, semester: sp.semester, sort: sp.sort === "helpful" ? "helpful" : "newest", page: Number(sp.page ?? 1) || 1 }),
  ]);
  const base = `/subjects/${slug}?${sp.semester ? `semester=${encodeURIComponent(sp.semester)}&` : ""}${sp.sort ? `sort=${sp.sort}&` : ""}`;
  return (
    <div>
      <PageTitle
        actions={
          <ActionForm action={followSubjectAction}>
            <input type="hidden" name="subjectId" value={subject.id} />
            <input type="hidden" name="path" value={`/subjects/${slug}`} />
            <SubmitButton variant={following ? "primary" : "default"} size="sm">
              {following ? "Following" : "Follow subject"}
            </SubmitButton>
          </ActionForm>
        }
      >
        {subject.name}
      </PageTitle>
      <nav aria-label="Semesters" className="mb-4 flex flex-wrap gap-2">
        <Link href={`/subjects/${slug}`} className={`btn btn-sm ${!sp.semester ? "btn-primary" : ""}`} aria-current={!sp.semester ? "page" : undefined}>
          All semesters
        </Link>
        {semesters.map((s) => (
          <Link
            key={s}
            href={`/subjects/${slug}?semester=${encodeURIComponent(s)}`}
            className={`btn btn-sm ${sp.semester === s ? "btn-primary" : ""}`}
            aria-current={sp.semester === s ? "page" : undefined}
          >
            {s}
          </Link>
        ))}
        <span className="ml-auto flex gap-2">
          <Link href={`/subjects/${slug}?${sp.semester ? `semester=${encodeURIComponent(sp.semester)}&` : ""}sort=newest`} className="btn btn-sm">
            Newest
          </Link>
          <Link href={`/subjects/${slug}?${sp.semester ? `semester=${encodeURIComponent(sp.semester)}&` : ""}sort=helpful`} className="btn btn-sm">
            Most helpful
          </Link>
        </span>
      </nav>
      <PostList posts={results.items} empty={<EmptyState title="No posts for this selection yet" />} />
      <Pagination page={results.page} pages={results.pages} makeHref={(p) => `${base}page=${p}`} />
    </div>
  );
}
