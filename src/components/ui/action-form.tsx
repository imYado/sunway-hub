"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = { ok?: boolean; error?: string; message?: string; reauth?: boolean; data?: unknown } | null;
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) {
    return (
      <p role="alert" className="mt-2 text-sm text-danger">
        {state.error}{" "}
        {state.reauth && (
          <Link href={`/admin/reauth?next=${typeof window !== "undefined" ? encodeURIComponent(window.location.pathname) : "/admin"}`} className="link">
            Confirm password
          </Link>
        )}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="mt-2 text-sm text-success">
        {state.message}
      </p>
    );
  }
  return null;
}

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  confirm,
  id,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      id={id}
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size,
  className = "",
  name,
  value,
}: {
  children: ReactNode;
  variant?: "primary" | "default" | "danger";
  size?: "sm";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const v = variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "";
  return (
    <button type="submit" name={name} value={value} disabled={pending} aria-disabled={pending} className={`btn ${v} ${size === "sm" ? "btn-sm" : ""} ${className}`}>
      {pending ? "Please wait..." : children}
    </button>
  );
}
