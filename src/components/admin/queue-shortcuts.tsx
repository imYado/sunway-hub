"use client";

import { useEffect } from "react";

/**
 * Keyboard shortcuts for the approval queue:
 * j / k = next / previous item, a = approve, r = reject (focus reason), c = request changes (focus note), x = select for bulk.
 */
export function QueueShortcuts() {
  useEffect(() => {
    let index = -1;
    const items = () => Array.from(document.querySelectorAll<HTMLElement>("[data-queue-item]"));
    function focusItem(i: number) {
      const list = items();
      if (list.length === 0) return;
      index = Math.max(0, Math.min(list.length - 1, i));
      list[index].focus();
      list[index].scrollIntoView({ block: "nearest" });
    }
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const current = items()[index];
      switch (e.key) {
        case "j":
          focusItem(index + 1);
          break;
        case "k":
          focusItem(index - 1);
          break;
        case "a":
          current?.querySelector<HTMLButtonElement>("[data-action=approve]")?.click();
          break;
        case "r":
          e.preventDefault();
          current?.querySelector<HTMLTextAreaElement>("[data-field=reason]")?.focus();
          break;
        case "c":
          e.preventDefault();
          current?.querySelector<HTMLTextAreaElement>("[data-field=reason]")?.focus();
          break;
        case "x": {
          const box = current?.querySelector<HTMLInputElement>("[data-field=select]");
          if (box) box.checked = !box.checked;
          break;
        }
        default:
          return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <p className="mb-4 text-sm text-muted">
      Shortcuts: <kbd>j</kbd>/<kbd>k</kbd> move, <kbd>a</kbd> approve, <kbd>r</kbd> reason, <kbd>x</kbd> select for bulk.
    </p>
  );
}
