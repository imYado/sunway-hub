"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { continueAsGuestAction } from "@/app/login/actions";

/**
 * First visit: the site is already showing in guest mode behind this popup.
 * Signing in goes to /login; anything else (the button, Escape, tapping outside)
 * keeps browsing as a guest and stops the popup from coming back.
 */
export function WelcomeDialog({ next }: { next: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  function asGuest() {
    setOpen(false);
    ref.current?.close();
    start(async () => {
      await continueAsGuestAction();
      router.refresh();
    });
  }

  if (!open) return null;
  const signIn = next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";

  return (
    <dialog
      ref={ref}
      aria-labelledby="welcome-title"
      aria-describedby="welcome-text"
      onCancel={(e) => {
        e.preventDefault();
        asGuest();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) asGuest();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-[16px] border border-line bg-bg p-0 text-ink backdrop:bg-[rgb(0_0_0/0.5)]"
    >
      <div className="p-6 text-center">
        <p aria-hidden="true" className="font-display text-[1.75rem] font-extrabold tracking-[-0.035em]">
          SJ Study
        </p>
        <h2 id="welcome-title" className="mt-4 text-lg font-semibold">
          Welcome
        </h2>
        <p id="welcome-text" className="mt-2 text-muted">
          Sign in with your Sunway email to post, comment, vote and message. You can also look around as a guest first.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link href={signIn} className="btn btn-primary w-full hover:no-underline">
            Sign in
          </Link>
          <button type="button" className="btn w-full" onClick={asGuest} disabled={pending}>
            Continue as a guest
          </button>
        </div>
      </div>
    </dialog>
  );
}
