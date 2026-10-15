import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/actor";
import { microsoftEnabled } from "@/server/auth/microsoft";
import { LoginFlow } from "./login-flow";

const MS_ERRORS: Record<string, string> = {
  ms_approval: "Sunway's IT needs to approve SJ Study before Microsoft sign-in works for your account. Use the email code below for now.",
  ms_cancelled: "Microsoft sign-in was cancelled.",
  ms_expired: "That sign-in took too long. Please try again.",
  ms_refused: "That Microsoft account can't sign in here. Use your Sunway university account.",
  ms_suspended: "This account is suspended. Contact the site admin if you think this is a mistake.",
  ms_busy: "Too many sign-in attempts. Please wait a few minutes and try again.",
  ms_failed: "Microsoft sign-in didn't complete. Please try again, or use the email code below.",
};

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const session = await getSession();
  if (session?.stage === "active") redirect("/");
  const initialStep = session?.stage === "needs_password" ? "create_password" : session?.stage === "needs_totp" ? "totp" : "email";
  return (
    <div className="py-8">
      <LoginFlow initialStep={initialStep} next={next} microsoft={microsoftEnabled()} initialError={error ? (MS_ERRORS[error] ?? MS_ERRORS.ms_failed) : null} />
    </div>
  );
}
