"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PasswordMeter } from "@/components/auth/password-meter";
import { isAcceptablePassword } from "@/lib/password-strength";
import { safeNext } from "@/lib/safe-next";
import type { OtpPurpose } from "@/server/auth/otp";
import {
  continueAsGuestAction,
  createPasswordAction,
  forgotPasswordAction,
  passwordAction,
  startLoginAction,
  startOtherEmailAction,
  totpAction,
  verifyCodeAction,
  verifyOtherCodeAction,
  type LoginResult,
} from "./actions";

type Step = "email" | "code" | "other_email" | "other_code" | "password" | "create_password" | "totp";


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
  // The Sunway address, kept while the person signs in with another email.
  const [sunwayEmail, setSunwayEmail] = useState("");
  const [otherEmail, setOtherEmail] = useState("");
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
    if (result.email && result.step !== "other_code") setEmail(result.email);
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
            <p className="mb-4 text-sm text-muted">Can&apos;t find it? Check your junk or spam folder first.</p>
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

        {step === "code" && purpose === "login" && (
          <section aria-labelledby="no-code" className="mt-6 border-t border-line pt-4 text-sm">
            <h2 id="no-code" className="font-semibold">
              Still no code? University email sometimes blocks it. You can:
            </h2>
            <ol className="mt-3 list-decimal space-y-3 pl-5">
              <li>
                Email{" "}
                <a href={`mailto:hubsunway@gmail.com?subject=${encodeURIComponent("Please verify my SJ Study account")}`} className="underline">
                  hubsunway@gmail.com
                </a>{" "}
                from <span className="break-all">{email}</span> and we&apos;ll verify you.
              </li>
              <li>
                <button
                  type="button"
                  className="underline"
                  disabled={pending}
                  onClick={() => {
                    setSunwayEmail(email);
                    setError(null);
                    setStep("other_email");
                  }}
                >
                  Sign in with another email
                </button>{" "}
                for now. You can post right away, but your account shows as not verified and can&apos;t use the Market or start messages until
                we verify it.
              </li>
              <li>
                <button type="button" className="underline" disabled={pending} onClick={() => run(() => continueAsGuestAction())}>
                  Continue as a guest
                </button>{" "}
                to look around without posting.
              </li>
            </ol>
          </section>
        )}

        {step === "other_email" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(() => startOtherEmailAction(sunwayEmail, otherEmail));
            }}
          >
            <h1 className="text-lg font-semibold">Sign in with another email</h1>
            <p className="mb-4 mt-1 text-sm text-muted">
              We&apos;ll send a code there. Your account is linked to <span className="break-all text-ink">{sunwayEmail}</span> and shows as not
              verified until we confirm it&apos;s yours.
            </p>
            <label htmlFor="other-email" className="label">
              Other email
            </label>
            <input
              id="other-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              className="input"
              value={otherEmail}
              onChange={(e) => setOtherEmail(e.target.value)}
              placeholder="you@gmail.com"
              aria-describedby={error ? "login-error" : undefined}
            />
            <button type="submit" className="btn btn-primary mt-4 w-full" disabled={pending}>
              {pending ? "Please wait..." : "Send code"}
            </button>
            <button
              type="button"
              className="btn mt-2 w-full"
              disabled={pending}
              onClick={() => {
                setError(null);
                setStep("code");
              }}
            >
              Back
            </button>
          </form>
        )}

        {step === "other_code" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const code = (new FormData(e.currentTarget).get("other-code") as string) ?? "";
              run(() => verifyOtherCodeAction(sunwayEmail, otherEmail, code));
            }}
          >
            <h1 className="text-lg font-semibold">Check your email</h1>
            <p className="mb-4 mt-1 text-sm text-muted">
              A 6-digit code is on its way to <span className="break-all text-ink">{otherEmail}</span>. It expires in 10 minutes. Check junk or spam
              too.
            </p>
            <label htmlFor="other-code" className="label">
              6-digit code
            </label>
            <input
              id="other-code"
              name="other-code"
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
                setError(null);
                setStep("other_email");
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
