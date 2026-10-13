import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { formatDate } from "@/lib/dates";
import { restorePostAction, unhidePostAction } from "@/app/actions/admin";
import { requireAdminPage } from "@/server/actor";
import { searchContent } from "@/server/dal/admin";

export const metadata: Metadata = { title: "Content" };

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ q?: string; deleted?: string }> }) {
  const actor = await requireAdminPage();
  const sp = await searchParams;
  const deleted = sp.deleted === "1";
  const rows = await searchContent(actor, { q: sp.q, deleted });
  return (
    <div>
      <PageTitle>Content</PageTitle>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <div className="flex-1">
          <label htmlFor="q" className="label">
            Search titles
          </label>
          <input id="q" name="q" defaultValue={sp.q} className="input" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="deleted" value="1" defaultChecked={deleted} className="h-4 w-4" />
          Deleted (restorable within 30 days)
        </label>
        <button type="submit" className="btn">
          Search
        </button>
      </form>
      <p className="mb-4 text-sm text-muted">
        Open a post to delete it (with a reason), see its title history and revert title edits. Clubs are managed under <Link href="/admin/clubs">Clubs</Link>.
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No posts found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface text-left">
                <th scope="col" className="border border-line p-2">Title</th>
                <th scope="col" className="border border-line p-2">Author</th>
                <th scope="col" className="border border-line p-2">Status</th>
                <th scope="col" className="border border-line p-2">Created</th>
                <th scope="col" className="border border-line p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="border border-line p-2">
                    <Link href={`/posts/${r.id}`}>{r.title}</Link>
                    {r.titleEdited && <span className="text-muted"> (edited)</span>}
                  </td>
                  <td className="border border-line p-2">{r.username ? `@${r.username}` : "Deleted user"}</td>
                  <td className="border border-line p-2">
                    {r.deletedAt ? `Deleted ${formatDate(r.deletedAt)}` : r.status}
                    {r.hiddenByReports && " · hidden"}
                    {r.deleteReason && <span className="block text-muted">{r.deleteReason}</span>}
                  </td>
                  <td className="border border-line p-2">{formatDate(r.createdAt)}</td>
                  <td className="border border-line p-2">
                    {r.deletedAt ? (
                      <ActionForm action={restorePostAction}>
                        <input type="hidden" name="postId" value={r.id} />
                        <SubmitButton variant="default" size="sm">
                          Restore
                        </SubmitButton>
                      </ActionForm>
                    ) : r.hiddenByReports ? (
                      <ActionForm action={unhidePostAction}>
                        <input type="hidden" name="postId" value={r.id} />
                        <SubmitButton variant="default" size="sm">
                          Unhide
                        </SubmitButton>
                      </ActionForm>
                    ) : (
                      <Link href={`/posts/${r.id}`} className="btn btn-sm">
                        Open
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
