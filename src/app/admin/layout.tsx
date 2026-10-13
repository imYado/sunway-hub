import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/server/actor";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin | Sunway Hub" } };

const SECTIONS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/queue", label: "Approval queue" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/clubs", label: "Clubs" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/words", label: "Blocked words" },
  { href: "/admin/settings", label: "Site settings" },
  { href: "/admin/legal", label: "Legal" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/data", label: "Data tools" },
  { href: "/admin/security", label: "Security" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Non-admins get a 404 so the admin area stays hidden.
  await requireAdminPage();
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav aria-label="Admin" className="lg:w-48 lg:shrink-0">
        <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
          {SECTIONS.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="block rounded border border-line px-3 py-1 text-sm text-ink hover:bg-surface hover:no-underline lg:border-0">
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
