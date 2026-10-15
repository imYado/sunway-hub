import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ChatNotice, PrivacyChatNotice } from "@/components/messages/chat-notice";
import { StartConversationForm } from "@/components/messages/start-form";
import { Avatar } from "@/components/ui/avatar";
import { FriendButton } from "@/components/friend-button";
import { requireMember } from "@/server/actor";
import { NotFoundError } from "@/server/errors";
import { friendState, type FriendState } from "@/server/dal/friends";
import { getPostDetail } from "@/server/dal/posts";
import { getProfile } from "@/server/dal/users";

export const metadata: Metadata = { title: "New message" };

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<{ to?: string; post?: string }> }) {
  const actor = await requireMember();
  const sp = await searchParams;
  let name: string;
  let username: string | null = null;
  let userId: string | null = null;
  let hasAvatar = false;
  let postTitle: string | null = null;
  let anonymous = false;
  try {
    if (sp.post) {
      const post = await getPostDetail(actor, sp.post);
      if (post.viewer.isOwner) notFound();
      postTitle = post.title;
      anonymous = post.author.anonymous && !actor.isAdmin;
      name = anonymous ? "Anonymous poster" : (post.author.displayName ?? `@${post.author.username}`);
      if (!anonymous && post.author.id && post.author.username) {
        userId = post.author.id;
        username = post.author.username;
        hasAvatar = post.author.hasAvatar;
      }
    } else if (sp.to) {
      const profile = await getProfile(actor, sp.to);
      if (profile.isOwner) notFound();
      name = profile.displayName;
      username = profile.username;
      userId = profile.id;
      hasAvatar = !!profile.avatar.approvedFileId;
    } else {
      notFound();
    }
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const state: FriendState = userId ? await friendState(actor, userId) : "none";
  const friends = state === "friends";
  const path = `/messages/new?${sp.post ? `post=${sp.post}` : `to=${sp.to}`}`;

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <header className="mb-2 flex items-center gap-3 border-b border-line pb-3">
        <Link href="/messages" aria-label="Back to messages" className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-surface">
          <ArrowLeft size={22} aria-hidden="true" />
        </Link>
        <Avatar userId={userId ?? ""} name={name} hasImage={hasAvatar} anonymous={anonymous} decorative size={40} />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{username ? <Link href={`/u/${username}`}>{name}</Link> : name}</h1>
          {username && <p className="truncate text-sm text-muted">@{username}</p>}
        </div>
      </header>

      <div className="py-4">
        {postTitle && (
          <ChatNotice title="About a post">
            <Link href={`/posts/${sp.post}`}>{postTitle}</Link>
          </ChatNotice>
        )}
        {friends ? (
          <ChatNotice title="You're friends">Say hi! Your message goes straight to {name}.</ChatNotice>
        ) : (
          <ChatNotice title="This will be a message request">
            <p>
              {anonymous ? "The poster" : `${name} isn't your friend yet, so they`} will only see your message if they accept it. Until then you can&apos;t
              send anything else, including images.
            </p>
            <p className="mt-2">They&apos;ll see your name. Messages can&apos;t be sent anonymously.</p>
            {anonymous && <p className="mt-2">The poster stays anonymous to you unless they choose to show their name.</p>}
            {userId && state !== "self" && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <FriendButton userId={userId} state={state} path={path} name={name} />
              </div>
            )}
          </ChatNotice>
        )}
        <PrivacyChatNotice />
      </div>

      <StartConversationForm to={sp.post ? undefined : sp.to} postId={sp.post} request={!friends} />
    </div>
  );
}
