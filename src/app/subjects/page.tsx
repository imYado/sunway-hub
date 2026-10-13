import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { requireMember } from "@/server/actor";
import { listSubjects } from "@/server/dal/posts";

export const metadata: Metadata = { title: "Subjects" };

export default async function SubjectsPage() {
  await requireMember();
  const subjects = (await listSubjects()).filter((s) => Number(s.posts) > 0);
  return (
    <div>
      <PageTitle>Subjects</PageTitle>
      {subjects.length === 0 ? (
        <EmptyState title="No subjects yet">Subjects appear here once posts with subject tags are approved.</EmptyState>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <li key={s.slug}>
              <Link href={`/subjects/${s.slug}`} className="card block p-4 text-ink hover:bg-surface hover:no-underline">
                <span className="font-medium">{s.name}</span>
                <span className="mt-1 block text-sm text-muted">
                  {s.posts} post{Number(s.posts) === 1 ? "" : "s"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
