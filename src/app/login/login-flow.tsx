"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PasswordMeter } from "@/components/auth/password-meter";
import { isAcceptablePassword } from "@/lib/password-strength";
import type { OtpPurpose } from "@/server/auth/otp";
import {
  createPasswordAction,
  forgotPasswordAction,
  passwordAction,
  startLoginAction,
  totpAction,
  verifyCodeAction,
  type LoginResult,
} from "./actions";

type Step = "email" | "code" | "password" | "create_password" | "totp";

function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginFlow({
  initialStep,
  next,
  microsoft = false,
  initialError = null,
}: {
  initialStep: Step;
  next?: string;
  microsoft?: boolean;
  initialError?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState<OtpPurpose>("login");
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function handle(result: LoginResult) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    if (result.email) setEmail(result.email);
    if (result.purpose) setPurpose(result.purpose);
    if (result.step === "done") {
      router.replace(safeNext(next));
      router.refresh();
      return;
    }
    if (result.step) {
      setPassword("");
      setStep(result.step);
    }
  }

  const run = (fn: () => Promise<LoginResult>) => startTransition(async () => handle(await fn()));

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="card p-6">
        <p className="mb-6 text-center font-display text-xl font-extrabold">SJ Study</p>

        {step === "email" && microsoft && (
          <>
            <a href={`/api/auth/microsoft${next ? `?next=${encodeURIComponent(safeNext(next))}` : ""}`} className="btn btn-primary w-full">
              Sign in with your Sunway Microsoft account
            </a>
            <p className="my-4 text-center text-xs text-muted">or get a code by email</p>
          </>
        )}

        {step === "email" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setInfo(null);
              run(() => startLoginAction(email));
            }}
          >
            <h1 className="sr-only">Sign in</h1>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@imail.sunway.edu.my"
              aria-describedby={error ? "login-error" : undefined}
            />
            <button type="submit" className={`btn mt-4 w-full ${microsoft ? "" : "btn-primary"}`} disabled={pending}>
              {pending ? "Please wait..." : microsoft ? "Email me a code" : "Continue"}
            </button>
          </form>
        )}

        {step === "code" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const code = (new FormData(e.currentTarget).get("code") as string) ?? "";
              run(() => verifyCodeAction(email, purpose, code));
            }}
          >
            <h1 className="text-lg font-semibold">Check your email</h1>
            <p className="mb-2 mt-1 text-sm text-muted">
              If this address can sign in, a 6-digit code is on its way to <span className="text-ink">{email}</span>. It expires in 10 minutes.
            </p>
            <p className="mb-4 text-sm text-muted">
              Can&apos;t find it? Check your junk or spam folder. Still nothing? Email{" "}
              <a href="mailto:hubsunway@gmail.com" className="underline">
                hubsunway@gmail.com
              </a>{" "}
              from your university email and we&apos;ll help you sign in.
            </p>
            <label htmlFor="code" className="label">
              6-digit code
            </label>
            <input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              required
              className="input tracking-widest"
              aria-describedby={error ? "login-error" : undefined}
            />
            <button type="submit" className="btn btn-primary mt-4 w-full" disabled={pending}>
              {pending ? "Checking..." : "Sign in"}
            </button>
            <button
              type="button"
              className="btn mt-2 w-full"
              disabled={pending}
              onClick={() => {
                setStep("email");
                setError(null);
              }}
            >
              Use a different email
            </button>
          </form>
        )}

        {step === "password" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => passwordAction(email, password));
            }}
          >
            <h1 className="text-lg font-semibold">Enter your password</h1>
            <p className="mb-4 mt-1 text-sm text-muted">{email}</p>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" className="btn btn-primary mt-4 w-full" disabled={pending}>
              {pending ? "Checking..." : "Sign in"}
            </button>
            <button
              type="button"
              className="btn mt-2 w-full"
              disabled={pending}
              onClick={() => {
                setInfo("We sent a reset code to the admin email.");
                run(() => forgotPasswordAction(email));
              }}
            >
              Forgot password
            </button>
          </form>
        )}

        {step === "create_password" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => createPasswordAction(password));
            }}
          >
            <h1 className="text-lg font-semibold">Create your password</h1>
            <p className="mb-4 mt-1 text-sm text-muted">At least 12 characters. Avoid common words. A long passphrase works well.</p>
            <label htmlFor="new-password" className="label">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordMeter password={password} email={email} />
            <button type="submit" className="btn btn-primary mt-4 w-full" disabled={pending || !isAcceptablePassword(password, email ? [email] : [])}>
              {pending ? "Saving..." : "Save password"}
            </button>
          </form>
        )}

        {step === "totp" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const code = (new FormData(e.currentTarget).get("totp") as string) ?? "";
              run(() => totpAction(code));
            }}
          >
            <h1 className="text-lg font-semibold">Two-factor authentication</h1>
            <p className="mb-4 mt-1 text-sm text-muted">Enter the current code from your authenticator app.</p>
            <label htmlFor="totp" className="label">
              Authenticator code
            </label>
            <input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required className="input tracking-widest" />
            <button type="submit" className="btn btn-primary mt-4 w-full" disabled={pending}>
              {pending ? "Checking..." : "Continue"}
            </button>
          </form>
        )}

        {error && (
          <p id="login-error" role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        {info && !error && (
          <p role="status" className="mt-4 text-sm text-muted">
            {info}
          </p>
        )}
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link>
      </p>
    </div>
  );
}
