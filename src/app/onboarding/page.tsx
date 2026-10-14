import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CleanInput, CleanTextarea } from "@/components/ui/clean-input";
import { Field } from "@/components/ui/field";
import { BIO_MAX, DISPLAY_NAME_MAX, PRONOUN_OPTIONS, ROLE_OPTIONS } from "@/lib/rules";
import { onboardingAction } from "@/app/actions/profile";
import { getActor } from "@/server/actor";
import { needsConsent } from "@/server/legal";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  const consent = await needsConsent(actor.id);
  if (actor.onboarded && !consent) redirect("/");

  const consentBox = (
    <div className="mb-6 flex items-start gap-3">
      <input id="acceptTerms" name="acceptTerms" type="checkbox" required className="mt-1 h-5 w-5" />
      <label htmlFor="acceptTerms" className="text-sm">
        I have read and accept the{" "}
        <Link href="/terms" target="_blank">
          Terms and Conditions
        </Link>{" "}
        and the{" "}
        <Link href="/privacy" target="_blank">
          Privacy Policy
        </Link>
        , and I agree to follow the{" "}
        <Link href="/guidelines" target="_blank">
          Community Guidelines
        </Link>
        .
      </label>
    </div>
  );

  if (actor.onboarded) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold">We have updated our policies</h1>
        <p className="mb-6 mt-2 text-muted">Please read the latest Terms and Privacy Policy and accept them to keep using Sunway Hub.</p>
        <ActionForm action={onboardingAction}>
          {consentBox}
          <SubmitButton>Accept and continue</SubmitButton>
        </ActionForm>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold">Welcome to Sunway Hub</h1>
      <p className="mb-6 mt-2 text-muted">Set up your profile. This only takes a minute.</p>
      <ActionForm action={onboardingAction}>
        <Field label="Full name" htmlFor="displayName">
          <CleanInput id="displayName" name="displayName" required maxLength={DISPLAY_NAME_MAX} autoComplete="name" />
        </Field>
        <Field label="Username" htmlFor="username" hint="3-20 characters: lowercase letters, numbers and underscores.">
          <CleanInput
            id="username"
            name="username"
            required
            minLength={2}
            maxLength={20}
            pattern="[a-z0-9_]{2,20}"
            autoCapitalize="none"
            autoComplete="username"
            aria-describedby="username-hint"
          />
        </Field>
        <fieldset className="mb-4">
          <legend className="label">I am a</legend>
          <div className="flex flex-wrap gap-4">
            {ROLE_OPTIONS.map((r) => (
              <label key={r.value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="roleLabel" value={r.value} defaultChecked={r.value === "student"} className="h-4 w-4" />
                {r.label}
              </label>
            ))}
          </div>
          <p className="hint">Teachers get a &quot;Verified teacher&quot; badge after the admin confirms it.</p>
        </fieldset>
        <fieldset className="mb-4">
          <legend className="label">Pronouns</legend>
          <div className="flex flex-wrap gap-4">
            {PRONOUN_OPTIONS.map((p) => (
              <label key={p.value} className="flex items-center gap-2 text-sm">
                <input type="radio" name="pronouns" value={p.value} defaultChecked={p.value === "unspecified"} className="h-4 w-4" />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Bio (optional)" htmlFor="bio">
          <CleanTextarea id="bio" name="bio" maxLength={BIO_MAX} rows={3} showCount />
        </Field>
        <p className="mb-4 text-sm text-muted">You can add a profile picture later in Settings.</p>
        {consentBox}
        <SubmitButton>Finish setup</SubmitButton>
      </ActionForm>
    </div>
  );
}
