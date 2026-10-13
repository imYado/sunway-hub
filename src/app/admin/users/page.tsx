import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { formatDate } from "@/lib/dates";
import { requireAdminPage } from "@/server/actor";
import { searchUsers } from "@/server/dal/admin";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const actor = await requireAdminPage();
  const sp = await searchParams;
  let users = await searchUsers(actor, sp.q ?? "");
  if (sp.filter === "teachers") users = users.filter((u) => u.roleLabel === "teacher" && !u.teacherVerified);
  return (
    <div>
      <PageTitle>Users</PageTitle>
      <form method="get" role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <label htmlFor="q" className="label">
            Search by email, username or name
          </label>
          <input id="q" name="q" defaultValue={sp.q} className="input" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="filter" value="teachers" defaultChecked={sp.filter === "teachers"} className="h-4 w-4" />
          Pending teacher verification
        </label>
        <button type="submit" className="btn">
          Search
        </button>
      </form>
      {users.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface text-left">
                <th scope="col" className="border border-line p-2">User</th>
                <th scope="col" className="border border-line p-2">Email</th>
                <th scope="col" className="border border-line p-2">Role</th>
                <th scope="col" className="border border-line p-2">Status</th>
                <th scope="col" className="border border-line p-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="border border-line p-2">
                    <Link href={`/admin/users/${u.id}`}>{u.username ? `@${u.username}` : "(not onboarded)"}</Link>
                    {u.displayName && <span className="block text-muted">{u.displayName}</span>}
                  </td>
                  <td className="border border-line p-2 break-all">{u.email}</td>
                  <td className="border border-line p-2">
                    {u.roleLabel}
                    {u.roleLabel === "teacher" && (u.teacherVerified ? " (verified)" : " (pending)")}
                  </td>
                  <td className="border border-line p-2">
                    {u.status}
                    {u.hiddenByReports && " · hidden"}
                  </td>
                  <td className="border border-line p-2">{formatDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
