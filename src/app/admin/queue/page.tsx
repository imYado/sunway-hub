import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { EmptyState, PageTitle } from "@/components/ui/empty";
import { QueueShortcuts } from "@/components/admin/queue-shortcuts";
import { PostLinks } from "@/components/posts/post-links";
import { formatDateTime } from "@/lib/dates";
import { formatBytes } from "@/lib/files";
import { bulkDecideAction, decideAvatarAction, decideLogoAction, decidePostAction } from "@/app/actions/admin";
import { requireAdminPage } from "@/server/actor";
import { pendingImages, pendingPosts } from "@/server/dal/admin";

export const metadata: Metadata = { title: "Approval queue" };

const TYPE_LABEL = { study: "Study Material", event: "Event", club: "Club Post" } as const;

export default async function QueuePage() {
  const actor = await requireAdminPage();
  const [posts, images] = await Promise.all([pendingPosts(actor), pendingImages(actor)]);

  return (
    <div>
      <PageTitle>Approval queue</PageTitle>
      <QueueShortcuts />

      <section aria-labelledby="q-posts">
        <h2 id="q-posts" className="mb-3 text-lg font-semibold">
          Posts and events ({posts.length})
        </h2>
        {posts.length === 0 ? (
          <EmptyState title="Nothing waiting for approval" />
        ) : (
          <>
            <ul className="space-y-4">
              {posts.map((p) => (
                <li key={p.id} data-queue-item tabIndex={-1} className="card p-4 focus:border-accent">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      form="bulk-form"
                      name="postIds"
                      value={p.id}
                      data-field="select"
                      aria-label={`Select "${p.title}" for bulk action`}
                      className="h-4 w-4"
                    />
                    <span className="badge">{TYPE_LABEL[p.type]}</span>
                    {p.clubName && <span>{p.clubName}</span>}
                    <span>{formatDateTime(p.createdAt)}</span>
                    <span>
                      by {p.username ? <Link href={`/u/${p.username}`}>@{p.username}</Link> : "unknown"}
                      {p.teacherVerified && " (verified teacher)"}
                      {p.anonymous && " (shown as Anonymous)"}
                    </span>
                  </div>
                  <h3 className="mt-2 text-lg font-semibold">
                    <Link href={`/posts/${p.id}`}>{p.title}</Link>
                    {p.titleEdited && <span className="ml-2 text-sm font-normal text-muted">(title edited)</span>}
                  </h3>
                  <p className="text-sm text-muted">
                    {[p.subjectText, p.semester].filter(Boolean).join(" · ")}
                  </p>
                  {p.startsAt && (
                    <p className="mt-1 text-sm">
                      Event: {formatDateTime(p.startsAt)}
                      {p.endsAt && ` to ${formatDateTime(p.endsAt)}`} at {p.location}
                      {p.capacity && ` (capacity ${p.capacity})`}
                    </p>
                  )}
                  {p.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{p.description}</p>}
                  {p.links.length > 0 && <PostLinks links={p.links} className="mt-3" />}
                  {p.files.length > 0 && (
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                      {p.files.map((f) => (
                        <li key={f.id} className="surface p-2 text-sm">
                          {f.kind === "image" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/files/${f.id}`} alt={`Preview of ${f.name}`} className="mb-2 max-h-64 w-full rounded object-contain" />
                          ) : f.kind === "video" ? (
                            <video controls preload="metadata" className="mb-2 w-full rounded" aria-label={`Preview of ${f.name}`}>
                              <source src={`/api/files/${f.id}`} type="video/mp4" />
                            </video>
                          ) : null}
                          <a href={`/api/files/${f.id}?download=1`} className="break-all">
                            {f.name}
                          </a>{" "}
                          <span className="text-muted">
                            ({f.kind.toUpperCase()}, {formatBytes(f.size)})
                          </span>
                          {f.duplicates > 0 && <p className="mt-1 text-danger">Same file already exists in {f.duplicates} other upload(s).</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <ActionForm action={decidePostAction} className="mt-4">
                    <input type="hidden" name="postId" value={p.id} />
                    <label htmlFor={`reason-${p.id}`} className="label">
                      Reason or note (required to reject or request changes)
                    </label>
                    <textarea id={`reason-${p.id}`} name="reason" data-field="reason" rows={2} maxLength={1000} className="input" />
                    <div className="mt-2 flex flex-wrap gap-2">

                        <SubmitButton name="decision" value="approve" size="sm">
                          <span data-action="approve">Approve</span>
                        </SubmitButton>

                      <SubmitButton name="decision" value="changes" variant="default" size="sm">
                        Request changes
                      </SubmitButton>
                      <SubmitButton name="decision" value="reject" variant="danger" size="sm">
                        Reject
                      </SubmitButton>
                    </div>
                  </ActionForm>
                </li>
              ))}
            </ul>
            <ActionForm action={bulkDecideAction} id="bulk-form" className="surface mt-4 p-4">
              <p className="mb-2 text-sm font-medium">Bulk action on selected posts</p>
              <label htmlFor="bulk-reason" className="label">
                Reason (required to reject)
              </label>
              <textarea id="bulk-reason" name="reason" rows={2} className="input" />
              <div className="mt-2 flex gap-2">
                <SubmitButton name="decision" value="approve" size="sm">
                  Approve selected
                </SubmitButton>
                <SubmitButton name="decision" value="reject" variant="danger" size="sm">
                  Reject selected
                </SubmitButton>
              </div>
            </ActionForm>
          </>
        )}
      </section>

      <section id="images" aria-labelledby="q-images" className="mt-10">
        <h2 id="q-images" className="mb-3 text-lg font-semibold">
          Profile pictures and club logos ({images.avatars.length + images.logos.length})
        </h2>
        {images.avatars.length + images.logos.length === 0 ? (
          <EmptyState title="No images waiting" />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {images.avatars.map((a) => (
              <li key={a.userId} data-queue-item tabIndex={-1} className="card p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/avatar/${a.userId}?pending=1`} alt={`Pending profile picture of ${a.displayName ?? a.username}`} width={160} height={160} className="rounded-full border border-line" />
                <p className="mt-2 text-sm">
                  Profile picture of {a.username ? <Link href={`/u/${a.username}`}>@{a.username}</Link> : "member"}
                </p>
                <ActionForm action={decideAvatarAction} className="mt-2">
                  <input type="hidden" name="userId" value={a.userId} />
                  <label htmlFor={`ar-${a.userId}`} className="label">
                    Reason (required to reject)
                  </label>
                  <textarea id={`ar-${a.userId}`} name="reason" data-field="reason" rows={2} className="input" />
                  <div className="mt-2 flex gap-2">
                    <SubmitButton name="decision" value="approve" size="sm">
                      <span data-action="approve">Approve</span>
                    </SubmitButton>
                    <SubmitButton name="decision" value="reject" variant="danger" size="sm">
                      Reject
                    </SubmitButton>
                  </div>
                </ActionForm>
              </li>
            ))}
            {images.logos.map((l) => (
              <li key={l.clubId} data-queue-item tabIndex={-1} className="card p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/club-logo/${l.clubId}?pending=1`} alt={`Pending logo for ${l.name}`} width={160} height={160} className="rounded border border-line" />
                <p className="mt-2 text-sm">
                  Logo for <Link href={`/clubs/${l.slug}`}>{l.name}</Link>
                </p>
                <ActionForm action={decideLogoAction} className="mt-2">
                  <input type="hidden" name="clubId" value={l.clubId} />
                  <label htmlFor={`lr-${l.clubId}`} className="label">
                    Reason (required to reject)
                  </label>
                  <textarea id={`lr-${l.clubId}`} name="reason" data-field="reason" rows={2} className="input" />
                  <div className="mt-2 flex gap-2">
                    <SubmitButton name="decision" value="approve" size="sm">
                      <span data-action="approve">Approve</span>
                    </SubmitButton>
                    <SubmitButton name="decision" value="reject" variant="danger" size="sm">
                      Reject
                    </SubmitButton>
                  </div>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
