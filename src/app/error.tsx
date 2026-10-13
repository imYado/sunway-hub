"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="text-sm text-muted">500</p>
      <h1 className="mt-2 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">Sorry about that. Please try again in a moment.</p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" className="btn" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="btn">
          Home
        </Link>
      </div>
    </div>
  );
}
