import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StartConversationForm } from "@/components/messages/start-form";
import { requireMember } from "@/server/actor";
import { NotFoundError } from "@/server/errors";
import { getPostDetail } from "@/server/dal/posts";
import { getProfile } from "@/server/dal/users";

export const metadata: Metadata = { title: "New message" };

export default async function NewMessagePage({ searchParams }: { searchParams: Promise<{ to?: string; post?: string }> }) {
  const actor = await requireMember();
  const sp = await searchParams;
  let toLabel: string;
  let postTitle: string | null = null;
  let anonymous = false;
  try {
    if (sp.post) {
      const post = await getPostDetail(actor, sp.post);
      if (post.viewer.isOwner) notFound();
      postTitle = post.title;
      anonymous = post.author.anonymous && !actor.isAdmin;
      toLabel = anonymous ? "the anonymous poster" : (post.author.displayName ?? `@${post.author.username}`);
    } else if (sp.to) {
      const profile = await getProfile(actor, sp.to);
      if (profile.isOwner) notFound();
      toLabel = profile.displayName ?? `@${profile.username}`;
    } else {
      notFound();
    }
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-xl font-semibold">Message {toLabel}</h1>
      {postTitle && (
        <p className="mb-4 text-muted">
          About <Link href={`/posts/${sp.post}`}>{postTitle}</Link>
        </p>
      )}
      <ul className="surface mb-4 list-disc space-y-1 p-4 pl-8 text-sm">
        <li>They&apos;ll see your name. Messages can&apos;t be sent anonymously.</li>
        <li>This is a request: you can send more, including images, once they accept.</li>
        {anonymous && <li>The poster stays anonymous to you unless they choose to show their name.</li>}
      </ul>
      <StartConversationForm to={sp.post ? undefined : sp.to} postId={sp.post} />
    </div>
  );
}
