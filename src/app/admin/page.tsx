import Link from "next/link";
import { PageTitle } from "@/components/ui/empty";
import { formatBytes } from "@/lib/files";
import { requireAdminPage } from "@/server/actor";
import { dashboard } from "@/server/dal/admin";

export default async function AdminDashboard() {
  const actor = await requireAdminPage();
  const d = await dashboard(actor);
  const pct = Math.min(100, Math.round(d.storage.ratio * 100));
  const tiles = [
    { label: "Pending posts", value: d.pendingPosts, href: "/admin/queue" },
    { label: "Pending profile pictures", value: d.pendingAvatars, href: "/admin/queue#images" },
    { label: "Pending club logos", value: d.pendingLogos, href: "/admin/queue#images" },
    { label: "Open reports", value: d.openReports, href: "/admin/reports" },
    { label: "Teacher verifications", value: d.pendingTeachers, href: "/admin/users?filter=teachers" },
    { label: "Club manager requests", value: d.pendingManagers, href: "/admin/clubs#requests" },
    { label: "Unhandled messages", value: d.openMessages, href: "/admin/messages" },
    { label: "New users this week", value: d.newUsers, href: "/admin/users" },
  ];
  return (
    <div>
      <PageTitle>Dashboard</PageTitle>
      {!actor.onboarded && (
        <p className="surface mb-4 p-3 text-sm">
          Finish <Link href="/onboarding">setting up your profile</Link> to post and appear on the site.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link href={t.href} className="card block p-4 text-ink hover:bg-surface hover:no-underline">
              <span className="block text-xl font-semibold">{t.value}</span>
              <span className="text-sm text-muted">{t.label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <section className="card mt-6 p-4" aria-labelledby="storage">
        <h2 id="storage" className="text-lg font-semibold">
          Storage
        </h2>
        <p className="mt-1 text-sm">
          Blob storage: {formatBytes(d.storage.used)} of {formatBytes(d.storage.cap)} ({pct}%)
        </p>
        <div className="mt-2 h-3 w-full rounded bg-skeleton" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Blob storage used">
          <div className={`h-3 rounded ${d.storage.warn ? "bg-danger" : "bg-ink"}`} style={{ width: `${pct}%` }} />
        </div>
        {d.storage.refuse ? (
          <p className="mt-2 text-sm text-danger">Uploads are refused automatically (90% reached). Clean up storage in Data tools.</p>
        ) : d.storage.warn ? (
          <p className="mt-2 text-sm text-danger">Warning: storage is above 80%.</p>
        ) : null}
        <p className="mt-3 text-sm">Database size: {formatBytes(d.databaseBytes)}</p>
      </section>
    </div>
  );
}
