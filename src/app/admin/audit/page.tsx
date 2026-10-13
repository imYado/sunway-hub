import type { Metadata } from "next";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { formatDateTime } from "@/lib/dates";
import { requireAdminPage } from "@/server/actor";
import { listAudit } from "@/server/dal/admin";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await requireAdminPage();
  const page = Math.max(1, Number((await searchParams).page ?? "1") || 1);
  const rows = await listAudit(actor, { page, limit: 100 });
  return (
    <div>
      <PageTitle
        actions={
          <a href="/api/admin/audit" className="btn btn-sm">
            Export CSV
          </a>
        }
      >
        Audit log
      </PageTitle>
      <p className="mb-4 text-sm text-muted">Every admin action and every deletion. Entries cannot be edited or deleted.</p>
      {rows.length === 0 ? (
        <EmptyState title="No entries" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface text-left">
                <th scope="col" className="border border-line p-2">When</th>
                <th scope="col" className="border border-line p-2">Actor</th>
                <th scope="col" className="border border-line p-2">Action</th>
                <th scope="col" className="border border-line p-2">Target</th>
                <th scope="col" className="border border-line p-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap border border-line p-2">{formatDateTime(r.at)}</td>
                  <td className="border border-line p-2">{r.actorLabel}</td>
                  <td className="border border-line p-2">{r.action}</td>
                  <td className="break-all border border-line p-2">{r.targetType ? `${r.targetType}:${r.targetId}` : "-"}</td>
                  <td className="border border-line p-2">{r.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="Pagination" className="mt-4 flex justify-between">
        {page > 1 ? (
          <a href={`/admin/audit?page=${page - 1}`} className="btn btn-sm">
            Newer
          </a>
        ) : (
          <span />
        )}
        {rows.length === 100 && (
          <a href={`/admin/audit?page=${page + 1}`} className="btn btn-sm">
            Older
          </a>
        )}
      </nav>
    </div>
  );
}
