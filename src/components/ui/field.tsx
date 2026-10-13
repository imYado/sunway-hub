import type { ReactNode } from "react";

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${htmlFor}-hint`} className="hint">
          {hint}
        </p>
      )}
    </div>
  );
}
