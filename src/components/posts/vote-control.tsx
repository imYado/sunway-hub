"use client";

import { useState, useTransition } from "react";
import { ArrowBigDown, ArrowBigUp } from "lucide-react";
import { voteCommentAction, votePostAction } from "@/app/actions/posts";

type Vote = 1 | -1 | null;

/**
 * Reddit-style up and down arrows. The count changes straight away and goes back
 * if the server refuses the vote.
 */
export function VoteControl({
  kind,
  id,
  postId,
  score,
  vote,
  canVote,
  path,
  layout = "column",
}: {
  kind: "post" | "comment";
  id: string;
  postId: string;
  score: number;
  vote: Vote;
  canVote: boolean;
  path?: string;
  layout?: "column" | "row";
}) {
  const [state, setState] = useState({ score, vote });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cast(next: 1 | -1) {
    const value: Vote = state.vote === next ? null : next;
    const before = state;
    setState({ vote: value, score: state.score - (state.vote ?? 0) + (value ?? 0) });
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set(kind === "post" ? "postId" : "commentId", id);
      fd.set("postId", postId);
      fd.set("value", String(value ?? 0));
      if (path) fd.set("path", path);
      const r = kind === "post" ? await votePostAction(null, fd) : await voteCommentAction(null, fd);
      if (r?.error) {
        setState(before);
        setError(r.error);
      }
    });
  }

  const label = kind === "post" ? "post" : "comment";
  const btn = "flex h-8 w-8 items-center justify-center rounded hover:bg-surface disabled:opacity-50";
  return (
    <div className={`flex items-center ${layout === "column" ? "flex-col" : "flex-row gap-1"}`}>
      {canVote ? (
        <button
          type="button"
          className={btn}
          aria-pressed={state.vote === 1}
          aria-label={`Upvote this ${label}`}
          disabled={pending}
          onClick={() => cast(1)}
        >
          <ArrowBigUp size={22} aria-hidden="true" fill={state.vote === 1 ? "currentColor" : "none"} />
        </button>
      ) : null}
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums" aria-label={`Score ${state.score}`}>
        {state.score}
      </span>
      {canVote ? (
        <button
          type="button"
          className={btn}
          aria-pressed={state.vote === -1}
          aria-label={`Downvote this ${label}`}
          disabled={pending}
          onClick={() => cast(-1)}
        >
          <ArrowBigDown size={22} aria-hidden="true" fill={state.vote === -1 ? "currentColor" : "none"} />
        </button>
      ) : null}
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
