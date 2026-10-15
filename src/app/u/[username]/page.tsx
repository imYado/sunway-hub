import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty";
import { PostList } from "@/components/posts/post-card";
import { ReportForm } from "@/components/report-form";
import { formatDate } from "@/lib/dates";
import { requireMember } from "@/server/actor";
import { NotFoundError } from "@/server/errors";
import { listProfilePosts, type ProfileTab } from "@/server/dal/posts";
import { getProfile } from "@/server/dal/users";

export const metadata: Metadata = { title: "Profile" };

const ROLE = { student: "Student", teacher: "Teacher", other: "Member" } as const;

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireMember();
  const { username } = await params;
  const { tab: rawTab } = await searchParams;
  let profile;
  try {
    profile = await getProfile(actor, username);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const ownerTabs: ProfileTab[] = ["posts", "pending", "rejected", "bookmarks"];
  const tabs: ProfileTab[] = profile.isOwner ? ownerTabs : profile.viewerIsAdmin ? ["posts", "pending", "rejected"] : ["posts"];
  const tab: ProfileTab = tabs.includes(rawTab as ProfileTab) ? (rawTab as ProfileTab) : "posts";
  const posts = await listProfilePosts(actor, profile.id, tab);
  const tabLabel = { posts: "Posts", pending: "Pending", rejected: "Rejected", bookmarks: "Bookmarks" } as const;
  const showPending = profile.isOwner && !!profile.avatar.pendingFileId;

  return (
    <div>
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col items-start gap-1">
          <Avatar
            userId={profile.id}
            name={profile.displayName}
            hasImage={showPending || !!profile.avatar.approvedFileId}
            pending={showPending}
            size={96}
          />
          {showPending && <span className="badge text-sm">Pending approval</span>}
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{profile.displayName}</h1>
          <p className="text-muted">
            @{profile.username}
            {profile.pronouns && <span> · {profile.pronouns}</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <span className="badge">{ROLE[profile.role]}</span>
            {profile.teacherBadge === "verified" && <span className="badge border-success text-success">Verified teacher</span>}
            {profile.teacherBadge === "pending" && <span className="badge">Teacher (pending verification)</span>}
          </div>
          {profile.bio && <p className="mt-3 whitespace-pre-wrap break-words">{profile.bio}</p>}
          <p className="mt-2 text-sm text-muted">
            {profile.email && (
              <>
                <a href={`mailto:${profile.email}`}>{profile.email}</a>
                {profile.isOwner && !profile.emailPublic && " (only you and the admin can see this)"} ·{" "}
              </>
            )}
            Joined {formatDate(profile.joinedAt)}
          </p>
          {profile.isOwner && (
            <Link href="/settings" className="btn btn-sm mt-3">
              Edit profile
            </Link>
          )}
          {!profile.isOwner && (
            <Link href={`/messages/new?to=${profile.username}`} className="btn btn-primary btn-sm mr-2 mt-3">
              Message
            </Link>
          )}
          {profile.viewerIsAdmin && !profile.isOwner && (
            <Link href={`/admin/users/${profile.id}`} className="btn btn-sm mt-3">
              Manage in admin
            </Link>
          )}
          {!profile.isOwner && <ReportForm targetType="user" targetId={profile.id} />}
        </div>
      </section>

      <nav aria-label="Profile sections" className="mt-8 flex flex-wrap gap-2 border-b border-line pb-2">
        {tabs.map((t) => (
          <Link
            key={t}
            href={`/u/${profile.username}?tab=${t}`}
            className={`btn btn-sm ${t === tab ? "btn-primary" : ""}`}
            aria-current={t === tab ? "page" : undefined}
          >
            {tabLabel[t]}
          </Link>
        ))}
      </nav>
      <div className="mt-4">
        <PostList posts={posts} showStatus={tab !== "posts" && tab !== "bookmarks"} empty={<EmptyState title={`No ${tabLabel[tab].toLowerCase()} yet`} />} />
      </div>
    </div>
  );
}
