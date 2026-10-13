"use client";

import { useEffect } from "react";

/** Marks the page as interactive. Browser tests wait for this before using forms. */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
