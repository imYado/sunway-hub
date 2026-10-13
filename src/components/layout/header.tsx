import Link from "next/link";
import { Bell, Menu, Plus, Search } from "lucide-react";
import type { Actor } from "@/server/actor-types";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/subjects", label: "Subjects" },
  { href: "/clubs", label: "Clubs" },
  { href: "/events", label: "Events" },
];

export function SiteHeader({ actor, unread }: { actor: Actor | null; unread: number }) {
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-ink hover:no-underline">
          Sunway Hub
        </Link>
        {actor && (
          <>
            <nav aria-label="Main" className="hidden flex-1 items-center gap-4 text-sm md:flex">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-ink">
                  {n.label}
                </Link>
              ))}
              {actor.isAdmin && (
                <Link href="/admin" className="text-ink">
                  Admin
                </Link>
              )}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <Link href="/search" className="btn btn-sm" aria-label="Search">
                <Search size={16} aria-hidden="true" />
              </Link>
              <Link href="/posts/new" className="btn btn-primary btn-sm">
                <Plus size={16} aria-hidden="true" />
                <span className="hidden sm:inline">New post</span>
                <span className="sr-only sm:hidden">New post</span>
              </Link>
              <Link href="/notifications" className="btn btn-sm" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
                <Bell size={16} aria-hidden="true" />
                {unread > 0 && <span className="text-sm font-semibold">{unread > 99 ? "99+" : unread}</span>}
              </Link>
              <details className="relative">
                <summary className="btn btn-sm cursor-pointer list-none" aria-label="Menu">
                  <Menu size={16} aria-hidden="true" />
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-56 rounded border border-line bg-white p-2 text-sm">
                  <ul className="flex flex-col">
                    {NAV.map((n) => (
                      <li key={n.href} className="md:hidden">
                        <Link href={n.href} className="block rounded px-3 py-2 text-ink hover:bg-surface">
                          {n.label}
                        </Link>
                      </li>
                    ))}
                    <li>
                      <Link href={`/u/${actor.username}`} className="block rounded px-3 py-2 text-ink hover:bg-surface">
                        My profile
                      </Link>
                    </li>
                    <li>
                      <Link href="/settings" className="block rounded px-3 py-2 text-ink hover:bg-surface">
                        Settings
                      </Link>
                    </li>
                    {actor.isAdmin && (
                      <li>
                        <Link href="/admin" className="block rounded px-3 py-2 text-ink hover:bg-surface">
                          Admin
                        </Link>
                      </li>
                    )}
                    <li>
                      <form action="/api/auth/logout" method="post">
                        <button type="submit" className="block w-full rounded px-3 py-2 text-left text-ink hover:bg-surface">
                          Sign out
                        </button>
                      </form>
                    </li>
                  </ul>
                </div>
              </details>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
