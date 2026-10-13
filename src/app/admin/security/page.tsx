import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageTitle } from "@/components/ui/empty";
import { encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { changePasswordAction, disableTotpAction, enableTotpAction } from "@/app/actions/admin";
import { requireAdminPage } from "@/server/actor";
import { getAdminSecurity } from "@/server/auth/login";
import { newTotpSecret, totpQrDataUrl } from "@/server/auth/totp";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const actor = await requireAdminPage();
  const sec = await getAdminSecurity(actor.id);
  const secret = sec?.totpEnabled ? null : newTotpSecret();
  const qr = secret ? await totpQrDataUrl(secret, actor.email) : null;
  return (
    <div className="space-y-6">
      <PageTitle>Security</PageTitle>
      <section className="card p-4" aria-labelledby="sec-totp">
        <h2 id="sec-totp" className="text-lg font-semibold">
          Two-factor authentication (TOTP)
        </h2>
        {sec?.totpEnabled ? (
          <>
            <p className="mt-1 text-sm text-success">On. You need your authenticator app every time you sign in.</p>
            <ActionForm action={disableTotpAction} className="mt-3" confirm="Turn off two-factor authentication?">
              <SubmitButton variant="danger" size="sm">
                Turn off
              </SubmitButton>
            </ActionForm>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-danger">Off. Strongly recommended: turn it on to protect the admin account.</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              <li>Open an authenticator app (for example Google Authenticator, Microsoft Authenticator, 1Password or Aegis).</li>
              <li>Scan this QR code, or enter the key by hand.</li>
              <li>Enter the 6-digit code it shows.</li>
            </ol>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr && <img src={qr} alt="QR code for setting up two-factor authentication" width={220} height={220} className="mt-3 rounded border border-line" />}
            <p className="mt-2 break-all text-sm">
              Key: <code>{secret}</code>
            </p>
            <ActionForm action={enableTotpAction} className="mt-3">
              <input type="hidden" name="secret" value={encryptSecret(env.sessionSecret, secret!)} />
              <label htmlFor="code" className="label">
                Code from the app
              </label>
              <input id="code" name="code" inputMode="numeric" maxLength={7} required className="input mb-3 max-w-40" />
              <SubmitButton>Turn on</SubmitButton>
            </ActionForm>
          </>
        )}
      </section>
      <section className="card p-4" aria-labelledby="sec-pw">
        <h2 id="sec-pw" className="mb-3 text-lg font-semibold">
          Change password
        </h2>
        <ActionForm action={changePasswordAction} resetOnSuccess>
          <label htmlFor="current" className="label">
            Current password
          </label>
          <input id="current" name="current" type="password" autoComplete="current-password" required className="input mb-3" />
          <label htmlFor="next" className="label">
            New password (at least 12 characters)
          </label>
          <input id="next" name="next" type="password" autoComplete="new-password" required minLength={12} className="input mb-3" />
          <SubmitButton>Change password</SubmitButton>
        </ActionForm>
      </section>
      <p className="text-sm text-muted">Admin sessions end after 12 hours without activity.</p>
    </div>
  );
}
