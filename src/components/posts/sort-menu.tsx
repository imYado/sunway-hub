"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SortOption {
  value: string;
  label: string;
  hint: string;
  href: string;
}

/**
 * One button showing the current sort. Tapping it opens a sheet that slides up
 * from the bottom on phones (a small menu on bigger screens) to pick another.
 */
export function SortMenu({ current, options }: { current: string; options: SortOption[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const active = options.find((o) => o.value === current) ?? options[0];

  useEffect(() => {
    if (!open) return;
    sheet.current?.querySelector<HTMLElement>("[aria-current='true'], a")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        className="btn btn-sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="sr-only">Sort: </span>
        {active.label}
        <ChevronDown size={16} aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {/* Backdrop: tap outside to close. */}
      <div
        aria-hidden="true"
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none md:bg-transparent ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <div
        id={id}
        ref={sheet}
        role="dialog"
        aria-label="Sort posts"
        aria-modal="false"
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-line bg-bg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg transition-transform duration-300 ease-out motion-reduce:transition-none md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-full md:mt-2 md:w-64 md:rounded md:border md:p-2 md:transition-[opacity,transform] md:duration-150 ${
          open ? "translate-y-0 md:opacity-100" : "pointer-events-none invisible translate-y-full md:-translate-y-1 md:opacity-0"
        }`}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-line md:hidden" />
        <p className="mb-2 px-3 text-sm font-semibold md:sr-only">Sort by</p>
        <ul className="flex flex-col">
          {options.map((o) => (
            <li key={o.value}>
              <Link
                href={o.href}
                aria-current={o.value === active.value ? "true" : undefined}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded px-3 py-3 text-ink hover:bg-surface hover:no-underline md:py-2"
              >
                <span className="flex-1">
                  <span className="block font-medium">{o.label}</span>
                  <span className="block text-sm text-muted">{o.hint}</span>
                </span>
                {o.value === active.value && <Check size={18} aria-hidden="true" />}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
