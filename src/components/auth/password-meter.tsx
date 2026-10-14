"use client";

import { checkPassword } from "@/lib/password-strength";

export function PasswordMeter({ password, email }: { password: string; email?: string }) {
  if (!password) return null;
  const r = checkPassword(password, email ? [email] : []);
  const pct = ((r.score + 1) / 5) * 100;
  return (
    <div className="mt-2" aria-live="polite">
      <div className="h-2 w-full rounded bg-skeleton" aria-hidden="true">
        <div className={`h-2 rounded ${r.score >= 2 ? "bg-ink" : "bg-danger"}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-sm text-muted">Strength: {r.label}</p>
      {r.problems.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-sm text-danger">
          {r.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
