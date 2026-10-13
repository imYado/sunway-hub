"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";

export function CopyLinkButton({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      <Link2 size={14} aria-hidden="true" />
      <span aria-live="polite">{copied ? "Link copied" : "Share link"}</span>
    </button>
  );
}
