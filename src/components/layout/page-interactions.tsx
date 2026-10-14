"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

function closeOpenPopups(except?: Node | null) {
  document.querySelectorAll<HTMLDetailsElement>("details[data-popup][open]").forEach((d) => {
    if (!except || !d.contains(except)) d.open = false;
  });
}

/**
 * Site-wide behaviour that makes the app feel quick:
 * - pop-up menus close as soon as you press anywhere outside them, press Escape, or pick an item;
 * - a thin bar shows at the top from the moment a link is clicked until the next page appears.
 */
export function PageInteractions() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // A new page has arrived: stop the loading bar and close any menu left open.
  useEffect(() => {
    delete document.documentElement.dataset.navigating;
    closeOpenPopups();
  }, [pathname, searchParams]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function onPointerDown(e: PointerEvent) {
      closeOpenPopups(e.target as Node);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const open = document.querySelector<HTMLDetailsElement>("details[data-popup][open]");
      if (!open) return;
      open.open = false;
      open.querySelector("summary")?.focus();
    }

    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      const link = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      const inPopup = target?.closest?.("details[data-popup]");
      if (inPopup && (link || target?.closest?.("button[type=submit]"))) {
        (inPopup as HTMLDetailsElement).open = false;
      }
      if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (url.pathname.startsWith("/api/")) return;
      document.documentElement.dataset.navigating = "";
      clearTimeout(timer);
      // Never leave the bar running if the navigation is abandoned.
      timer = setTimeout(() => delete document.documentElement.dataset.navigating, 10_000);
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
      clearTimeout(timer);
    };
  }, []);

  return <div className="nav-progress" aria-hidden="true" />;
}
