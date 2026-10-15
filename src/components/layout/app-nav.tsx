"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  BookOpen,
  Calendar,
  CalendarDays,
  Hash,
  House,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  Shield,
  SquarePlus,
  Store,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "./theme-toggle";

export interface NavUser {
  id: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
  hasAvatar: boolean;
}

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function countText(n: number) {
  return n > 99 ? "99+" : String(n);
}

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span aria-hidden="true" className="absolute -right-2 -top-1.5 min-w-[18px] rounded-full bg-ink px-1 text-center text-[11px] font-semibold leading-[18px] text-on-ink">
      {countText(n)}
    </span>
  );
}

function accessibleLabel(item: Item) {
  if (!item.count) return item.label;
  return item.href === "/notifications" ? `${item.label}, ${item.count} unread` : `${item.label}, ${item.count} new`;
}

function Logo({ short = false }: { short?: boolean }) {
  return (
    <Link href="/" className="font-display text-[1.375rem] font-extrabold tracking-[-0.035em] text-ink hover:no-underline">
      {short ? (
        <>
          <span aria-hidden="true">SJ</span>
          <span className="sr-only">SJ Study</span>
        </>
      ) : (
        "SJ Study"
      )}
    </Link>
  );
}

const MENU_ROW = "flex w-full items-center gap-3 rounded px-3 py-2 text-left text-ink hover:bg-surface hover:no-underline";

function MenuLinks({ items }: { items: Item[] }) {
  return (
    <>
      {items.map((n) => (
        <li key={n.href}>
          <Link href={n.href} className={MENU_ROW}>
            <n.icon size={20} aria-hidden="true" />
            {n.label}
          </Link>
        </li>
      ))}
    </>
  );
}

function SignOut() {
  return (
    <li>
      <form action="/api/auth/logout" method="post">
        <button type="submit" className={MENU_ROW}>
          <LogOut size={20} aria-hidden="true" />
          Sign out
        </button>
      </form>
    </li>
  );
}

const ALL = {
  home: { href: "/", label: "Home", icon: House },
  search: { href: "/search", label: "Search", icon: Search },
  market: { href: "/market", label: "Market", icon: Store },
  tags: { href: "/subjects", label: "Tags", icon: Hash },
  clubs: { href: "/clubs", label: "Clubs", icon: Users },
  events: { href: "/events", label: "Events", icon: CalendarDays },
  schedule: { href: "/schedule", label: "Schedule", icon: Calendar },
  groups: { href: "/study-groups", label: "Study groups", icon: BookOpen },
  create: { href: "/posts/new", label: "New post", icon: SquarePlus },
  leaderboard: { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  settings: { href: "/settings", label: "Settings", icon: Settings },
  admin: { href: "/admin", label: "Admin", icon: Shield },
} satisfies Record<string, Item>;

/**
 * True while the visitor is scrolling down the page (and not near the top).
 * Scrolling up, or reaching the top, brings the bars back.
 */
function useScrollingDown(): [boolean, (v: boolean) => void] {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - last;
        // Ignore tiny movements so the bars don't flicker.
        if (y < 64) setDown(false);
        else if (delta > 8) setDown(true);
        else if (delta < -8) setDown(false);
        if (Math.abs(delta) > 8 || y < 64) last = y;
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return [down, setDown];
}

/**
 * Facebook / Instagram style navigation: a bar along the bottom on phones and a
 * sidebar on the left on bigger screens. The profile button is your own picture.
 */
export function AppNav({ user, guest, unread, unreadMessages }: { user: NavUser | null; guest: boolean; unread: number; unreadMessages: number }) {
  const pathname = usePathname() ?? "/";
  const [scrollingDown, setScrollingDown] = useScrollingDown();
  // A new page always starts with the bars showing.
  useEffect(() => setScrollingDown(false), [pathname, setScrollingDown]);
  if (!user && !guest) {
    return (
      <header className="sticky top-0 z-30 border-b border-line bg-bg">
        <div className="mx-auto flex max-w-content items-center gap-6 px-4 py-3 sm:px-6">
          <Logo />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
    );
  }

  const messages: Item = { href: "/messages", label: "Messages", icon: MessageCircle, count: unreadMessages };
  const notifications: Item = { href: "/notifications", label: "Notifications", icon: Bell, count: unread };
  const profileHref = user ? `/u/${user.username}` : "/login";
  const profileActive = !!user && isActive(pathname, profileHref);

  const sidebar: Item[] = user
    ? [ALL.home, ALL.search, ALL.market, ALL.tags, ALL.clubs, ALL.events, ALL.schedule, ALL.groups, messages, notifications, ALL.create]
    : [ALL.home, ALL.search, ALL.market, ALL.tags, ALL.clubs, ALL.events];
  const sidebarMore: Item[] = user ? [ALL.leaderboard, ALL.settings, ...(user.isAdmin ? [ALL.admin] : [])] : [ALL.leaderboard];

  const bottom: Item[] = user ? [ALL.home, ALL.search, ALL.create, ALL.market] : [ALL.home, ALL.search, ALL.market, ALL.clubs];
  const phoneMore: Item[] = user
    ? [ALL.tags, ALL.clubs, ALL.events, ALL.schedule, ALL.groups, ALL.leaderboard, ALL.settings, ...(user.isAdmin ? [ALL.admin] : [])]
    : [ALL.tags, ALL.events, ALL.leaderboard];

  const everything: Item[] = [...bottom, ...sidebar, ...sidebarMore, ...phoneMore, messages, notifications];
  const match = everything.filter((n) => isActive(pathname, n.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const current: { label: string; icon?: LucideIcon; avatar?: boolean } = profileActive
    ? { label: "Profile", avatar: true }
    : match
      ? { label: match.label, icon: match.icon }
      : { label: "Menu" };

  const profileAvatar = (size: number) =>
    user ? <Avatar userId={user.id} name={user.displayName ?? user.username} hasImage={user.hasAvatar} decorative size={size} /> : null;

  return (
    <>
      {/* Laptop and tablet: sidebar on the left. Icons only on tablets, icons and words on laptops. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col border-r border-line bg-bg px-3 py-5 md:flex lg:w-60">
        <div className="px-3 pb-6">
          <span className="lg:hidden">
            <Logo short />
          </span>
          <span className="hidden lg:inline">
            <Logo />
          </span>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto">
          <ul className="flex flex-col gap-1">
            {sidebar.map((n) => {
              const active = isActive(pathname, n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    title={n.label}
                    className={`flex items-center justify-center gap-4 rounded px-3 py-2.5 text-ink hover:bg-surface hover:no-underline lg:justify-start ${active ? "font-bold" : ""}`}
                  >
                    <span className="relative">
                      <n.icon size={24} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                      <Badge n={n.count} />
                    </span>
                    <span className="sr-only lg:not-sr-only">{n.label}</span>
                    {n.count ? <span className="sr-only">{`, ${countText(n.count)} ${n.href === "/notifications" ? "unread" : "new"}`}</span> : null}
                  </Link>
                </li>
              );
            })}
            {user ? (
              <li>
                <Link
                  href={profileHref}
                  aria-current={profileActive ? "page" : undefined}
                  title="Profile"
                  className={`flex items-center justify-center gap-4 rounded px-3 py-2.5 text-ink hover:bg-surface hover:no-underline lg:justify-start ${profileActive ? "font-bold" : ""}`}
                >
                  <span className={`inline-flex rounded-full ${profileActive ? "ring-2 ring-ink ring-offset-2 ring-offset-bg" : ""}`}>{profileAvatar(26)}</span>
                  <span className="sr-only lg:not-sr-only">Profile</span>
                </Link>
              </li>
            ) : (
              <li className="mt-2">
                <a href="/login" className="btn btn-primary w-full" title="Sign in">
                  <LogIn size={18} aria-hidden="true" />
                  <span className="sr-only lg:not-sr-only">Sign in</span>
                </a>
              </li>
            )}
          </ul>
        </nav>
        <details className="relative" data-popup>
          <summary
            className="flex cursor-pointer list-none items-center justify-center gap-4 rounded px-3 py-2.5 text-ink hover:bg-surface lg:justify-start"
            aria-label="More"
            title="More"
          >
            <Menu size={24} aria-hidden="true" />
            <span aria-hidden="true" className="hidden lg:inline">
              More
            </span>
          </summary>
          <div className="absolute bottom-full left-0 z-40 mb-2 w-60 rounded border border-line bg-bg p-2 text-sm shadow-lg">
            <ul className="flex flex-col">
              <MenuLinks items={sidebarMore} />
              <li>
                <ThemeToggle variant="menu" />
              </li>
              {user && <SignOut />}
            </ul>
          </div>
        </details>
      </aside>

      {/* Phones: a slim top bar with messages and notifications... */}
      <header
        className={`sticky top-0 z-30 border-b border-line bg-bg transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden ${
          scrollingDown ? "-translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="flex items-center gap-1 px-4 py-2">
          <Logo />
          <div className="ml-auto flex items-center gap-1">
            {user ? (
              [notifications, messages].map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-label={accessibleLabel(n)}
                  aria-current={isActive(pathname, n.href) ? "page" : undefined}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface"
                >
                  <span className="relative">
                    <n.icon size={24} strokeWidth={isActive(pathname, n.href) ? 2.5 : 2} aria-hidden="true" />
                    <Badge n={n.count} />
                  </span>
                </Link>
              ))
            ) : (
              <a href="/login" className="btn btn-primary btn-sm">
                Sign in
              </a>
            )}
            <details className="relative" data-popup>
              <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-ink hover:bg-surface" aria-label="More">
                <Menu size={24} aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-full z-40 mt-2 w-60 rounded border border-line bg-bg p-2 text-sm shadow-lg">
                <ul className="flex flex-col">
                  <MenuLinks items={phoneMore} />
                  <li>
                    <ThemeToggle variant="menu" />
                  </li>
                  {user && <SignOut />}
                </ul>
              </div>
            </details>
          </div>
        </div>
      </header>

      {/* ...and the main pages along the bottom, with your picture as the profile button. */}
      <nav
        aria-label="Main"
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] transition-transform duration-300 ease-out motion-reduce:transition-none md:hidden ${
          scrollingDown ? "translate-y-full" : "translate-y-0"
        }`}
      >
        <ul className="grid grid-cols-5">
          {bottom.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-label={n.label}
                  aria-current={active ? "page" : undefined}
                  className="flex h-14 items-center justify-center text-ink hover:no-underline"
                >
                  <n.icon size={26} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
          <li>
            {user ? (
              <Link
                href={profileHref}
                aria-label="Profile"
                aria-current={profileActive ? "page" : undefined}
                className="flex h-14 items-center justify-center hover:no-underline"
              >
                <span className={`inline-flex rounded-full ${profileActive ? "ring-2 ring-ink ring-offset-2 ring-offset-bg" : ""}`}>{profileAvatar(28)}</span>
              </Link>
            ) : (
              <a href="/login" aria-label="Sign in" className="flex h-14 items-center justify-center text-ink hover:no-underline">
                <LogIn size={26} aria-hidden="true" />
              </a>
            )}
          </li>
        </ul>
      </nav>
      {/* While scrolling down, only the current page's symbol stays; tap it to bring the bar back. */}
      <button
        type="button"
        onClick={() => setScrollingDown(false)}
        aria-label={`Show navigation (${current.label})`}
        tabIndex={scrollingDown ? 0 : -1}
        aria-hidden={!scrollingDown}
        className={`fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-bg text-ink shadow-lg transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none md:hidden ${
          scrollingDown ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0"
        }`}
      >
        {current.avatar ? profileAvatar(30) : current.icon ? <current.icon size={24} strokeWidth={2.5} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
      </button>
    </>
  );
}
