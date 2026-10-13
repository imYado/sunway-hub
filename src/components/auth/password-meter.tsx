"use client";

import { checkPassword } from "@/lib/password-strength";

export function PasswordMeter({ password, email }: { password: string; email?: string }) {
  if (!password) return null;
  const r = checkPassword(password, email ? [email] : []);
  const pct = ((r.score + 1) / 5) * 100;
  const colour = r.score >= 3 ? "#15803D" : r.score === 2 ? "#1D4ED8" : "#B91C1C";
  return (
    <div className="mt-2" aria-live="polite">
      <div className="h-2 w-full rounded bg-skeleton" aria-hidden="true">
        <div className="h-2 rounded" style={{ width: `${pct}%`, background: colour }} />
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
