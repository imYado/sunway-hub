import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/ui/empty";
import { formatBytes } from "@/lib/files";
import { requireAdminPage } from "@/server/actor";
import { hasRecentAuth } from "@/server/auth/session";
import { EXPORTABLE_TABLE_NAMES } from "@/server/dal/export";
import { storageStatus } from "@/server/dal/uploads";

export const metadata: Metadata = { title: "Data tools" };

export default async function DataPage() {
  const actor = await requireAdminPage();
  const storage = await storageStatus();
  const recent = hasRecentAuth(actor);
  return (
    <div className="space-y-6">
      <PageTitle>Data tools</PageTitle>
      {!recent && (
        <p className="surface p-3 text-sm">
          Exports need a recent password confirmation. <Link href="/admin/reauth?next=/admin/data">Confirm your password</Link> first.
        </p>
      )}
      <section className="card p-4" aria-labelledby="d-backup">
        <h2 id="d-backup" className="text-lg font-semibold">
          Full backup
        </h2>
        <p className="mb-3 mt-1 text-sm text-muted">
          Downloads every table as one JSON file (sessions, sign-in codes and the admin password hash are left out). Files in Blob storage are not
          included. Neon&apos;s point-in-time restore is the main backup; see the README.
        </p>
        <a href="/api/admin/backup" className="btn btn-primary">
          Download full backup (JSON)
        </a>
      </section>
      <section className="card p-4" aria-labelledby="d-tables">
        <h2 id="d-tables" className="mb-3 text-lg font-semibold">
          Export a table
        </h2>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {EXPORTABLE_TABLE_NAMES.map((t) => (
            <li key={t} className="flex items-center justify-between gap-2 border-b border-line py-1">
              <code>{t}</code>
              <span className="flex gap-2">
                <a href={`/api/admin/export?table=${t}&format=csv`}>CSV</a>
                <a href={`/api/admin/export?table=${t}&format=json`}>JSON</a>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="card p-4" aria-labelledby="d-storage">
        <h2 id="d-storage" className="text-lg font-semibold">
          Storage clean-up
        </h2>
        <p className="mt-1 text-sm">
          Using {formatBytes(storage.used)} of {formatBytes(storage.cap)}.
        </p>
        <p className="mt-2 text-sm text-muted">
          The daily job permanently deletes soft-deleted posts and files after 30 days and removes abandoned uploads after 24 hours. To free space
          sooner, delete posts in <Link href="/admin/content">Content</Link>, or raise <code>STORAGE_CAP_GB</code> if your Blob plan allows.
        </p>
      </section>
    </div>
  );
}
