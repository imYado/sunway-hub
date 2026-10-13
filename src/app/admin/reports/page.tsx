import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { formatDateTime } from "@/lib/dates";
import { REPORT_REASONS } from "@/lib/rules";
import { resolveReportAction } from "@/app/actions/admin";
import { requireAdminPage } from "@/server/actor";
import { openReports } from "@/server/dal/admin";

export const metadata: Metadata = { title: "Reports" };

const REASON = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

export default async function ReportsPage() {
  const actor = await requireAdminPage();
  const groups = await openReports(actor);
  return (
    <div>
      <PageTitle>Reports</PageTitle>
      {groups.length === 0 ? (
        <EmptyState title="No open reports" />
      ) : (
        <ul className="space-y-4">
          {groups.map((g) => (
            <li key={`${g.targetType}-${g.targetId}`} className="card p-4">
              <p className="font-medium">
                {g.link ? <Link href={g.link}>{g.label}</Link> : g.label}
                {g.hidden && <span className="badge ml-2 text-danger">Auto-hidden</span>}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {g.items.map((r) => (
                  <li key={r.id}>
                    {formatDateTime(r.createdAt)} · {REASON[r.reason]} · by {r.reporter ? `@${r.reporter}` : "deleted user"}
                    {r.note && <span className="block text-muted">&quot;{r.note}&quot;</span>}
                  </li>
                ))}
              </ul>
              <ActionForm action={resolveReportAction} className="mt-3">
                <input type="hidden" name="targetType" value={g.targetType} />
                <input type="hidden" name="targetId" value={g.targetId} />
                <label htmlFor={`note-${g.targetId}`} className="label">
                  Note (sent to the user for remove, warn and ban)
                </label>
                <textarea id={`note-${g.targetId}`} name="note" rows={2} className="input" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <SubmitButton name="op" value="dismiss" variant="default" size="sm">
                    Dismiss
                  </SubmitButton>
                  <SubmitButton name="op" value="remove" variant="danger" size="sm">
                    Remove content
                  </SubmitButton>
                  {g.targetType !== "club" && (
                    <>
                      <SubmitButton name="op" value="warn" variant="default" size="sm">
                        Warn user
                      </SubmitButton>
                      <SubmitButton name="op" value="ban" variant="danger" size="sm">
                        Ban user
                      </SubmitButton>
                    </>
                  )}
                </div>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
