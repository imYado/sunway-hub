import "@fontsource-variable/archivo";
import "@fontsource-variable/hanken-grotesk";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { cookies, headers } from "next/headers";
import { SiteFooter } from "@/components/layout/footer";
import { SiteHeader } from "@/components/layout/header";
import { HydrationMarker } from "@/components/layout/hydration-marker";
import { PageInteractions } from "@/components/layout/page-interactions";
import { GUEST_COOKIE, getActor } from "@/server/actor";
import { unreadCount } from "@/server/dal/notifications";
import { unreadMessageCount } from "@/server/dal/messages";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: { default: "SJ Study", template: "%s | SJ Study" },
  description: "Unofficial, student-run study resources and campus events for the Sunway community.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0A0A" },
  ],
};

const ALWAYS_AVAILABLE = ["/login", "/terms", "/privacy", "/guidelines", "/copyright", "/contact"];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [h, c] = await Promise.all([headers(), cookies()]);
  const savedTheme = c.get("theme")?.value;
  const theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : undefined;
  const pathname = h.get("x-pathname") ?? "/";
  let actor = null;
  let settings = null;
  let unread = 0;
  let unreadMessages = 0;
  try {
    [actor, settings] = await Promise.all([getActor(), getSettings()]);
    if (actor?.onboarded) [unread, unreadMessages] = await Promise.all([unreadCount(actor), unreadMessageCount(actor)]);
  } catch (err) {
    console.error("Layout data failed:", err instanceof Error ? err.name : "unknown");
  }
  const guest = !actor && c.get(GUEST_COOKIE)?.value === "1";
  const maintenance =
    !!settings?.maintenanceMode && !actor?.isAdmin && !ALWAYS_AVAILABLE.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <html lang="en" data-theme={theme}>
      <body className="flex min-h-screen flex-col bg-bg text-base text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-bg focus:p-2">
          Skip to content
        </a>
        <SiteHeader actor={actor?.onboarded ? actor : null} guest={guest} unread={unread} unreadMessages={unreadMessages} />
        {guest && (
          <div role="region" aria-label="Guest mode" className="border-b border-line bg-surface">
            <p className="mx-auto max-w-content px-4 py-2 text-sm sm:px-6">
              You&apos;re browsing as a guest, so you can look around but not post, comment or message.{" "}
              <a href="/login">Sign in</a>
            </p>
          </div>
        )}
        {settings?.announcement && (
          <div role="region" aria-label="Announcement" className="border-b border-line bg-surface">
            <p className="mx-auto max-w-content px-4 py-2 text-sm sm:px-6">{settings.announcement}</p>
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-content flex-1 px-4 py-8 sm:px-6 sm:py-12">
          {maintenance ? (
            <div className="surface p-6">
              <h1 className="text-lg font-semibold">SJ Study is down for maintenance</h1>
              <p className="mt-2 text-muted">We are making some improvements. Please check back soon.</p>
            </div>
          ) : (
            children
          )}
        </main>
        <SiteFooter />
        <HydrationMarker />
        <Suspense fallback={null}>
          <PageInteractions />
        </Suspense>
      </body>
    </html>
  );
}
