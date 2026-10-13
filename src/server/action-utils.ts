import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AppError, ReauthRequiredError } from "./errors";

export type ActionState = { ok?: boolean; error?: string; message?: string; reauth?: boolean; data?: unknown } | null;

/** Turns thrown errors into friendly form state. Never leaks internal details. */
export function toActionState(err: unknown): ActionState {
  unstable_rethrow(err);
  if (err instanceof ReauthRequiredError) return { error: err.message, reauth: true };
  if (err instanceof AppError) return { error: err.message };
  if (err instanceof ZodError) return { error: err.issues[0]?.message ?? "Please check the form and try again." };
  console.error("Action failed:", err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : "unknown");
  return { error: "Something went wrong. Please try again." };
}

export async function runAction(fn: () => Promise<string | void | ActionState>): Promise<ActionState> {
  try {
    const r = await fn();
    if (r && typeof r === "object") return r;
    return { ok: true, message: typeof r === "string" ? r : undefined };
  } catch (err) {
    return toActionState(err);
  }
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
