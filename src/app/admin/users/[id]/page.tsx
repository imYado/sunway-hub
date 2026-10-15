import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { formatDate, formatDateTime } from "@/lib/dates";
import { ROLE_OPTIONS } from "@/lib/rules";
import { userAction } from "@/app/actions/admin";
import { requireAdminPage } from "@/server/actor";
import { NotFoundError } from "@/server/errors";
import { getUserForAdmin } from "@/server/dal/admin";
import { clubsManagedBy, listAllClubsForAdmin } from "@/server/dal/clubs";

export const metadata: Metadata = { title: "User" };

function Op({ userId, op, label, variant = "default", children, confirm }: { userId: string; op: string; label: string; variant?: "default" | "danger" | "primary"; children?: React.ReactNode; confirm?: string }) {
  return (
    <ActionForm action={userAction} confirm={confirm} className="surface p-3">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="op" value={op} />
      {children}
      <SubmitButton variant={variant} size="sm">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage();
  const { id } = await params;
  let data;
  try {
    data = await getUserForAdmin(actor, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { user: u } = data;
  const [managed, clubs] = await Promise.all([clubsManagedBy([u.id]), listAllClubsForAdmin(actor)]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar userId={u.id} name={u.displayName} hasImage={!!data.avatar?.approvedFileId} size={64} />
        <div>
          {data.identity ? (
            <>
              <h1 className="text-xl font-semibold">{data.identity.name ?? "(no name)"} (deleted account)</h1>
              <p className="text-muted">
                {data.identity.username ? `@${data.identity.username}` : "No username"} · {data.identity.email}
                {data.identity.deletedAt && ` · deleted ${formatDateTime(data.identity.deletedAt)}`}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold">{u.displayName ?? "(no name)"}</h1>
              <p className="text-muted">
                {u.username ? <Link href={`/u/${u.username}`}>@{u.username}</Link> : "Not onboarded"} · {u.email}
              </p>
            </>
          )}
        </div>
      </div>
      <dl className="card grid grid-cols-2 gap-2 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted">Status</dt>
          <dd>
            {u.status}
            {u.suspendedUntil && ` until ${formatDate(u.suspendedUntil)}`}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Role</dt>
          <dd>
            {u.roleLabel}
            {u.roleLabel === "teacher" && (u.teacherVerified ? " (verified)" : " (pending)")}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Pronouns</dt>
          <dd>{u.pronouns === "unspecified" ? "rather not say" : u.pronouns}</dd>
        </div>
        <div>
          <dt className="text-muted">Joined</dt>
          <dd>{formatDate(u.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">Last seen</dt>
          <dd>{u.lastSeenAt ? formatDateTime(u.lastSeenAt) : "-"}</dd>
        </div>
        <div>
          <dt className="text-muted">Warnings</dt>
          <dd>{u.warningCount}</dd>
        </div>
        <div className="col-span-2 sm:col-span-3">
          <dt className="text-muted">Bio</dt>
          <dd>{u.bio ?? "-"}</dd>
        </div>
      </dl>

      {u.onboardedAt && u.status !== "deleted" && (
        <ActionForm action={userAction} className="surface max-w-sm p-3">
          <input type="hidden" name="userId" value={u.id} />
          <input type="hidden" name="op" value="username" />
          <label htmlFor="new-username" className="label">
            Username
          </label>
          <input
            id="new-username"
            name="username"
            required
            pattern="[a-z0-9_]{2,20}"
            defaultValue={u.username ?? ""}
            aria-describedby="new-username-hint"
            className="input"
          />
          <p id="new-username-hint" className="mb-2 mt-1 text-sm text-muted">
            2-20 characters. Only you can give out two-character usernames.
          </p>
          <SubmitButton size="sm">Change username</SubmitButton>
        </ActionForm>
      )}

      {data.isAdminAccount ? (
        <p className="surface p-3 text-sm">This is the admin account. It cannot be banned, suspended, signed out, demoted or deleted.</p>
      ) : (
        <section aria-labelledby="u-actions" className="space-y-3">
          <h2 id="u-actions" className="text-lg font-semibold">
            Actions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Op userId={u.id} op="role" label="Change role label">
              <label htmlFor="role" className="label">
                Role label
              </label>
              <select id="role" name="role" defaultValue={u.roleLabel} className="input mb-2">
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Op>
            {u.roleLabel === "teacher" &&
              (u.teacherVerified ? (
                <Op userId={u.id} op="unverify_teacher" label="Remove teacher badge" />
              ) : (
                <Op userId={u.id} op="verify_teacher" label="Verify teacher" variant="primary" />
              ))}
            <Op userId={u.id} op="assign_club" label="Make club manager">
              <label htmlFor="assign-club" className="label">
                Club
              </label>
              <select id="assign-club" name="clubId" className="input mb-2" required>
                {clubs
                  .filter((c) => !c.deletedAt)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </Op>
            {managed.map((m) => (
              <Op key={m.clubId} userId={u.id} op="remove_club" label={`Remove as manager of ${m.name}`}>
                <input type="hidden" name="clubId" value={m.clubId} />
              </Op>
            ))}
            <Op userId={u.id} op="warn" label="Send warning">
              <label htmlFor="warn-reason" className="label">
                Message
              </label>
              <textarea id="warn-reason" name="reason" required rows={2} className="input mb-2" />
            </Op>
            <Op userId={u.id} op="sign_out" label="Force sign-out everywhere" />
            <Op userId={u.id} op="suspend" label="Suspend" variant="danger">
              <label htmlFor="days" className="label">
                Days
              </label>
              <input id="days" name="days" type="number" min={1} max={365} defaultValue={7} className="input mb-2" />
              <label htmlFor="suspend-reason" className="label">
                Reason
              </label>
              <textarea id="suspend-reason" name="reason" required rows={2} className="input mb-2" />
            </Op>
            {u.status === "active" ? (
              <Op userId={u.id} op="ban" label="Ban" variant="danger" confirm="Ban this user?">
                <label htmlFor="ban-reason" className="label">
                  Reason
                </label>
                <textarea id="ban-reason" name="reason" required rows={2} className="input mb-2" />
              </Op>
            ) : (
              <Op userId={u.id} op="reinstate" label="Reinstate (lift ban or suspension)" variant="primary" />
            )}
            <Op userId={u.id} op="delete" label="Delete account" variant="danger" confirm="Delete this account? This cannot be undone.">
              <fieldset className="mb-2 text-sm">
                <legend className="label">Posts</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="mode" value="anonymise_posts" defaultChecked /> Keep, anonymised
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="mode" value="delete_posts" /> Delete
                </label>
              </fieldset>
              <label htmlFor="delete-reason" className="label">
                Reason
              </label>
              <textarea id="delete-reason" name="reason" required rows={2} className="input mb-2" />
            </Op>
          </div>
          <p className="text-sm text-muted">Suspend, ban, sign-out and delete ask you to confirm your password if you have not done so recently.</p>
        </section>
      )}

      <section aria-labelledby="u-posts">
        <h2 id="u-posts" className="mb-2 text-lg font-semibold">
          Posts ({data.posts.length})
        </h2>
        <ul className="space-y-1 text-sm">
          {data.posts.map((p) => (
            <li key={p.id}>
              <Link href={`/posts/${p.id}`}>{p.title}</Link> <span className="text-muted">({p.deletedAt ? "deleted" : p.status}, {formatDate(p.createdAt)})</span>
            </li>
          ))}
        </ul>
      </section>
      {data.reports.length > 0 && (
        <section aria-labelledby="u-reports">
          <h2 id="u-reports" className="mb-2 text-lg font-semibold">
            Reports about this profile
          </h2>
          <ul className="space-y-1 text-sm">
            {data.reports.map((r) => (
              <li key={r.id}>
                {formatDate(r.createdAt)}: {r.reason} ({r.status}){r.note ? `: ${r.note}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
