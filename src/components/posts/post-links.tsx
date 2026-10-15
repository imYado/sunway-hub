import { ExternalLink } from "lucide-react";
import type { PostLink } from "@/db/schema";

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** External links shared in a post. They open in a new tab and pass no referrer. */
export function PostLinks({ links, className = "" }: { links: PostLink[]; className?: string }) {
  return (
    <ul className={`space-y-2 ${className}`} aria-label="Links">
      {links.map((l, i) => (
        <li key={`${l.url}-${i}`} className="card p-3">
          <a href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="flex items-start gap-2 break-words">
            <ExternalLink size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>
              <span className="font-medium">{l.label}</span>
              <span className="block text-sm text-muted">{host(l.url)}</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
