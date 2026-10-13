"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#FFFFFF", color: "#111111", padding: 32 }}>
        <h1 style={{ fontSize: 24 }}>Something went wrong</h1>
        <p>Sorry about that. Please try again in a moment.</p>
        <button type="button" onClick={() => reset()} style={{ border: "1px solid #E5E7EB", borderRadius: 6, padding: "8px 16px", background: "#FFFFFF" }}>
          Try again
        </button>
      </body>
    </html>
  );
}
