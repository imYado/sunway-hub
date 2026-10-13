import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/actor";
import { LoginFlow } from "./login-flow";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const session = await getSession();
  if (session?.stage === "active") redirect("/");
  const initialStep = session?.stage === "needs_password" ? "create_password" : session?.stage === "needs_totp" ? "totp" : "email";
  return (
    <div className="py-8">
      <LoginFlow initialStep={initialStep} next={next} />
    </div>
  );
}
