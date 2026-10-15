import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CleanTextarea } from "@/components/ui/clean-input";
import { EmptyState } from "@/components/ui/empty";
import { Pagination, PostList } from "@/components/posts/post-card";
import { ReportForm } from "@/components/report-form";
import { ClubLogo } from "@/components/club-logo";
import { formatDateTime } from "@/lib/dates";
import { followClubAction } from "@/app/actions/posts";
import { requestManageAction } from "@/app/actions/clubs";
import { requireMember } from "@/server/actor";
import { NotFoundError } from "@/server/errors";
import { clubRecentPosts, clubUpcomingEvents, getClub } from "@/server/dal/clubs";

export const metadata: Metadata = { title: "Club" };

const SOCIAL_URL: Record<string, (h: string) => string> = {
  instagram: (h) => `https://www.instagram.com/${h}/`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  linkedin: (h) => `https://www.linkedin.com/company/${h}`,
  website: (h) => h,
};

export default async function ClubPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ show?: string; page?: string }> }) {
  const actor = await requireMember({ guestOk: true });
  const { slug } = await params;
  const sp = await searchParams;
  const officialOnly = sp.show === "official";
  let detail;
  try {
    detail = await getClub(actor, slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { club } = detail;
  const [events, recent] = await Promise.all([clubUpcomingEvents(actor, club.id), clubRecentPosts(actor, club.id, { officialOnly, page: Number(sp.page ?? "1") || 1 })]);
  const path = `/clubs/${club.slug}`;
  const canManage = detail.isManager || actor.isAdmin;

  return (
    <div>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <ClubLogo clubId={club.id} name={club.name} hasLogo={!!club.logoFileId} size={96} />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{club.name}</h1>
          <p className="text-muted">{club.category}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {detail.unclaimed && <span className="badge">Unclaimed</span>}
            <span className="badge">
              {detail.followers} follower{detail.followers === 1 ? "" : "s"}
            </span>
          </div>
          {club.description && <p className="mt-3 whitespace-pre-wrap break-words">{club.description}</p>}
          {Object.keys(club.socials).length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-4 text-sm">
              {Object.entries(club.socials).map(([k, v]) => (
                <li key={k}>
                  <a href={SOCIAL_URL[k]?.(v) ?? "#"} rel="noopener noreferrer nofollow" target="_blank">
                    {k === "website" ? "Website" : `${k[0].toUpperCase()}${k.slice(1)}: @${v}`}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionForm action={followClubAction}>
              <input type="hidden" name="clubId" value={club.id} />
              <input type="hidden" name="path" value={path} />
              <SubmitButton variant={detail.following ? "primary" : "default"} size="sm">
                {detail.following ? "Following" : "Follow"}
              </SubmitButton>
            </ActionForm>
            {canManage && (
              <>
                <Link href={`${path}/manage`} className="btn btn-sm">
                  Edit club
                </Link>
                <Link href={`/posts/new?type=event&club=${club.id}`} className="btn btn-sm">
                  Post an event
                </Link>
                <Link href={`/posts/new?type=club&club=${club.id}`} className="btn btn-sm">
                  Post an official update
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="club-events">
        <h2 id="club-events" className="mb-3 text-lg font-semibold">
          Upcoming events
        </h2>
        {events.length === 0 ? (
          <EmptyState title="No upcoming events" />
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="card p-3">
                <Link href={`/posts/${e.id}`} className="font-medium">
                  {e.title}
                </Link>
                <p className="text-sm text-muted">
                  {formatDateTime(e.startsAt)} · {e.location}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="club-posts">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="club-posts" className="text-lg font-semibold">
            Posts
          </h2>
          {!actor.guest && (
            <Link href={`/posts/new?type=discussion&club=${club.id}`} className="btn btn-sm">
              Post in this club
            </Link>
          )}
        </div>
        <nav aria-label="Club posts" className="mb-4 flex gap-2">
          <Link href={path} className={`btn btn-sm ${!officialOnly ? "btn-primary" : ""}`} aria-current={!officialOnly ? "page" : undefined}>
            Everyone
          </Link>
          <Link href={`${path}?show=official`} className={`btn btn-sm ${officialOnly ? "btn-primary" : ""}`} aria-current={officialOnly ? "page" : undefined}>
            Official
          </Link>
        </nav>
        <PostList
          posts={recent.items}
          path={path}
          empty={
            <EmptyState title={officialOnly ? "No official posts yet" : "No posts yet"}>
              {officialOnly ? "Updates from the club's managers appear here." : "Anyone can post in a club by tagging it."}
            </EmptyState>
          }
        />
        <Pagination page={recent.page} pages={recent.pages} makeHref={(p) => `${path}?${officialOnly ? "show=official&" : ""}page=${p}`} />
      </section>

      <section className="mt-8" aria-labelledby="club-managers">
        <h2 id="club-managers" className="mb-3 text-lg font-semibold">
          Club managers
        </h2>
        {detail.managers.length === 0 ? (
          <p className="text-sm text-muted">This club has no managers on SJ Study yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-4 text-sm">
            {detail.managers.map((m) => (
              <li key={m.id}>{m.username ? <Link href={`/u/${m.username}`}>{m.displayName ?? `@${m.username}`}</Link> : "Deleted user"}</li>
            ))}
          </ul>
        )}
        {!detail.isManager && (
          <details className="mt-4">
            <summary className="btn btn-sm cursor-pointer list-none">Request to manage this club</summary>
            <div className="surface mt-2 p-4">
              {detail.pendingRequest ? (
                <p className="text-sm">Your request is waiting for the admin.</p>
              ) : (
                <ActionForm action={requestManageAction}>
                  <input type="hidden" name="clubId" value={club.id} />
                  <input type="hidden" name="path" value={path} />
                  <label htmlFor="cm-message" className="label">
                    Your role in the club
                  </label>
                  <CleanTextarea id="cm-message" name="message" required minLength={10} maxLength={1000} rows={3} />
                  <label htmlFor="cm-proof" className="label mt-3">
                    Proof
                  </label>
                  <CleanTextarea
                    id="cm-proof"
                    name="proof"
                    required
                    maxLength={500}
                    rows={2}
                    placeholder="For example: I am the club president; link to the club's committee post naming me."
                  />
                  <div className="mt-3">
                    <SubmitButton size="sm">Send request</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </div>
          </details>
        )}
        {!actor.guest && <ReportForm targetType="club" targetId={club.id} />}
      </section>
    </div>
  );
}
