import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { timeAgo } from "@/lib/dates";
import { requireMember } from "@/server/actor";
import { listNotifications, markAllRead } from "@/server/dal/notifications";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const actor = await requireMember();
  const items = await listNotifications(actor);
  // Opening the page marks everything as read (the list above was loaded first, so unread items stay highlighted once).
  await markAllRead(actor);
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle>Notifications</PageTitle>
      {items.length === 0 ? (
        <EmptyState title="You are all caught up" />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className={`card p-4 ${n.readAt ? "" : "border-accent"}`}>
              <p className="font-medium">
                {!n.readAt && <span className="sr-only">New: </span>}
                {n.link ? <Link href={n.link}>{n.title}</Link> : n.title}
              </p>
              {n.body && <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>}
              <p className="mt-1 text-sm text-muted">{timeAgo(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
