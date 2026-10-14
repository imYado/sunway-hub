import "@fontsource-variable/inter";
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { SiteFooter } from "@/components/layout/footer";
import { SiteHeader } from "@/components/layout/header";
import { HydrationMarker } from "@/components/layout/hydration-marker";
import { getActor } from "@/server/actor";
import { unreadCount } from "@/server/dal/notifications";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = {
  title: { default: "SJ Study", template: "%s | SJ Study" },
  description: "Unofficial, student-run study resources and campus events for the Sunway community.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFFFFF",
};

const ALWAYS_AVAILABLE = ["/login", "/terms", "/privacy", "/guidelines", "/copyright", "/contact"];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const pathname = h.get("x-pathname") ?? "/";
  let actor = null;
  let settings = null;
  let unread = 0;
  try {
    [actor, settings] = await Promise.all([getActor(), getSettings()]);
    if (actor?.onboarded) unread = await unreadCount(actor);
  } catch (err) {
    console.error("Layout data failed:", err instanceof Error ? err.name : "unknown");
  }
  const maintenance =
    !!settings?.maintenanceMode && !actor?.isAdmin && !ALWAYS_AVAILABLE.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-bg text-base text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
          Skip to content
        </a>
        <SiteHeader actor={actor?.onboarded ? actor : null} unread={unread} />
        {settings?.announcement && (
          <div role="region" aria-label="Announcement" className="border-b border-line bg-surface">
            <p className="mx-auto max-w-5xl px-4 py-2 text-sm">{settings.announcement}</p>
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
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
      </body>
    </html>
  );
}
