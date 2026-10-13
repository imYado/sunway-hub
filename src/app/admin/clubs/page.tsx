import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { CleanInput, CleanTextarea } from "@/components/ui/clean-input";
import { Field } from "@/components/ui/field";
import { formatDate } from "@/lib/dates";
import { CLUB_CATEGORIES } from "@/lib/rules";
import { addClubAction, csvImportAction, deleteClubAction, editClubAction, importClubsAction, managerRequestAction } from "@/app/actions/admin";
import { requireAdminPage } from "@/server/actor";
import { listAllClubsForAdmin, listManagerRequests } from "@/server/dal/clubs";

export const metadata: Metadata = { title: "Clubs" };

export default async function AdminClubsPage() {
  const actor = await requireAdminPage();
  const [clubs, requests] = await Promise.all([listAllClubsForAdmin(actor), listManagerRequests(actor)]);
  return (
    <div className="space-y-8">
      <PageTitle>Clubs</PageTitle>

      <section className="card p-4" aria-labelledby="c-import">
        <h2 id="c-import" className="text-lg font-semibold">
          Import Sunway clubs
        </h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          Loads the built-in list of Sunway clubs and student bodies. Safe to click more than once: existing clubs are never duplicated or overwritten.
          Imported clubs show as &quot;Unclaimed&quot; until a club manager is approved.
        </p>
        <ActionForm action={importClubsAction}>
          <SubmitButton>Import Sunway clubs</SubmitButton>
        </ActionForm>
      </section>

      <section id="requests" className="card p-4" aria-labelledby="c-requests">
        <h2 id="c-requests" className="mb-3 text-lg font-semibold">
          Club manager requests ({requests.length})
        </h2>
        {requests.length === 0 ? (
          <p className="text-sm text-muted">No pending requests.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className="surface p-3 text-sm">
                <p>
                  <Link href={`/admin/users/${r.userId}`}>@{r.username}</Link> ({r.email}) wants to manage{" "}
                  <Link href={`/clubs/${r.clubSlug}`}>{r.clubName}</Link> · {formatDate(r.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap">Message: {r.message}</p>
                <p className="mt-1 whitespace-pre-wrap break-words">Proof: {r.proof}</p>
                <ActionForm action={managerRequestAction} className="mt-2">
                  <input type="hidden" name="requestId" value={r.id} />
                  <label htmlFor={`mr-${r.id}`} className="label">
                    Note to the member (optional)
                  </label>
                  <textarea id={`mr-${r.id}`} name="reason" rows={2} className="input" />
                  <div className="mt-2 flex gap-2">
                    <SubmitButton name="decision" value="approve" size="sm">
                      Approve
                    </SubmitButton>
                    <SubmitButton name="decision" value="reject" variant="danger" size="sm">
                      Reject
                    </SubmitButton>
                  </div>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-4" aria-labelledby="c-add">
          <h2 id="c-add" className="mb-3 text-lg font-semibold">
            Add club
          </h2>
          <ActionForm action={addClubAction} resetOnSuccess>
            <Field label="Name" htmlFor="club-name">
              <CleanInput id="club-name" name="name" required maxLength={120} />
            </Field>
            <Field label="Category" htmlFor="club-category">
              <select id="club-category" name="category" className="input" required>
                {CLUB_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Instagram handle" htmlFor="club-ig">
              <input id="club-ig" name="instagram" className="input" />
            </Field>
            <Field label="Description" htmlFor="club-desc">
              <CleanTextarea id="club-desc" name="description" rows={3} maxLength={2000} />
            </Field>
            <SubmitButton>Add club</SubmitButton>
          </ActionForm>
        </section>
        <section className="card p-4" aria-labelledby="c-csv">
          <h2 id="c-csv" className="mb-3 text-lg font-semibold">
            Bulk import CSV
          </h2>
          <p className="mb-3 text-sm text-muted">
            Columns: <code>name, category, instagram, description</code>. Category must match one of the twelve categories exactly. Existing clubs (same
            name) are skipped.
          </p>
          <ActionForm action={csvImportAction} resetOnSuccess>
            <label htmlFor="csv" className="label">
              CSV file
            </label>
            <input id="csv" name="csv" type="file" accept=".csv,text/csv" required className="block w-full text-sm" />
            <div className="mt-3">
              <SubmitButton variant="default">Import CSV</SubmitButton>
            </div>
          </ActionForm>
        </section>
      </div>

      <section aria-labelledby="c-all">
        <h2 id="c-all" className="mb-3 text-lg font-semibold">
          All clubs ({clubs.length})
        </h2>
        {clubs.length === 0 ? (
          <EmptyState title="No clubs yet">Use &quot;Import Sunway clubs&quot; above.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {clubs.map((c) => (
              <li key={c.id} className="card p-3 text-sm">
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-medium">{c.name}</span> <span className="text-muted">· {c.category}</span>
                    {c.managers === 0 && <span className="badge ml-2">Unclaimed</span>}
                    {c.deletedAt && <span className="badge ml-2 text-danger">Deleted</span>}
                    {c.hiddenByReports && <span className="badge ml-2 text-danger">Hidden</span>}
                  </summary>
                  <div className="mt-3 grid gap-4 lg:grid-cols-2">
                    <ActionForm action={editClubAction}>
                      <input type="hidden" name="clubId" value={c.id} />
                      <Field label="Name" htmlFor={`n-${c.id}`}>
                        <CleanInput id={`n-${c.id}`} name="name" defaultValue={c.name} required />
                      </Field>
                      <Field label="Category" htmlFor={`cat-${c.id}`}>
                        <select id={`cat-${c.id}`} name="category" defaultValue={c.category} className="input">
                          {CLUB_CATEGORIES.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Instagram" htmlFor={`ig-${c.id}`}>
                        <input id={`ig-${c.id}`} name="instagram" defaultValue={c.instagram ?? ""} className="input" />
                      </Field>
                      <p className="mb-2 text-sm text-muted">The description is edited by club managers on the club page.</p>
                      <div className="flex gap-2">
                        <SubmitButton variant="default" size="sm">
                          Save
                        </SubmitButton>
                        <Link href={`/clubs/${c.slug}/manage`} className="btn btn-sm">
                          Edit page
                        </Link>
                      </div>
                    </ActionForm>
                    <ActionForm action={deleteClubAction} confirm={c.deletedAt ? undefined : "Delete this club?"}>
                      <input type="hidden" name="clubId" value={c.id} />
                      {c.deletedAt ? (
                        <>
                          <input type="hidden" name="op" value="restore" />
                          <SubmitButton variant="default" size="sm">
                            Restore club
                          </SubmitButton>
                        </>
                      ) : (
                        <>
                          <label htmlFor={`del-${c.id}`} className="label">
                            Reason for deleting
                          </label>
                          <textarea id={`del-${c.id}`} name="reason" required rows={2} className="input mb-2" />
                          <SubmitButton variant="danger" size="sm">
                            Delete club
                          </SubmitButton>
                        </>
                      )}
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
