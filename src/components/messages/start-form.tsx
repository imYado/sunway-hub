"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CleanTextarea } from "@/components/ui/clean-input";
import { PROFANITY_MESSAGE, containsProfanity } from "@/lib/profanity/filter";
import { DM_MAX } from "@/lib/rules";
import { startConversationAction } from "@/app/actions/messages";

export function StartConversationForm({ to, postId, request = true }: { to?: string; postId?: string; request?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const body = String(new FormData(e.currentTarget).get("body") ?? "").trim();
    if (!body) return setError("Write a message.");
    if (containsProfanity(body)) return setError(PROFANITY_MESSAGE);
    setBusy(true);
    try {
      const r = await startConversationAction({ to: to ?? "", postId: postId ?? "", body });
      if (!r?.ok) return setError(r?.error ?? "Something went wrong. Please try again.");
      router.push(`/messages/${(r.data as { id: string }).id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="sticky bottom-20 rounded-[22px] border border-line bg-bg p-2 md:bottom-4">
      <label htmlFor="dm-body" className="sr-only">
        Your message
      </label>
      <div className="flex items-end gap-2">
        <CleanTextarea
          id="dm-body"
          name="body"
          rows={2}
          maxLength={DM_MAX}
          required
          placeholder={request ? "Write your message request..." : "Message..."}
          className="input min-h-[44px] flex-1 resize-none border-0 bg-transparent"
        />
        <button type="submit" className="btn btn-primary btn-sm shrink-0" disabled={busy}>
          {busy ? "Sending..." : request ? "Send request" : "Send"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 px-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
