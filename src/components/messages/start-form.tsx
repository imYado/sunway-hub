"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CleanTextarea } from "@/components/ui/clean-input";
import { PROFANITY_MESSAGE, containsProfanity } from "@/lib/profanity/filter";
import { DM_MAX } from "@/lib/rules";
import { startConversationAction } from "@/app/actions/messages";

export function StartConversationForm({ to, postId }: { to?: string; postId?: string }) {
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
    <form onSubmit={onSubmit}>
      <label htmlFor="dm-body" className="label">
        Your message
      </label>
      <CleanTextarea id="dm-body" name="body" rows={5} maxLength={DM_MAX} required showCount />
      <button type="submit" className="btn btn-primary mt-3" disabled={busy}>
        {busy ? "Sending..." : "Send request"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
