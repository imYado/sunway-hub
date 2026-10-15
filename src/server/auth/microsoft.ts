import "server-only";
import { createHash } from "node:crypto";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { emailFromMicrosoftClaims, decodeJwtPayload, MicrosoftClaimError } from "@/lib/microsoft";
import { AppError } from "../errors";
import { enforce, LIMITS } from "../rate-limit";
import { signInMember, type NewSession, type SessionContext } from "./login";

const AUTHORITY = "https://login.microsoftonline.com/organizations/oauth2/v2.0";
export const MS_STATE_COOKIE = "sh_ms_oauth";
export const MS_REFUSED = "That Microsoft account can't sign in here. Use your Sunway university account.";

export function microsoftEnabled(): boolean {
  return !!(env.microsoftClientId && env.microsoftClientSecret);
}

export function microsoftRedirectUri(): string {
  return `${env.appUrl}/api/auth/microsoft/callback`;
}

export interface PendingMicrosoftLogin {
  state: string;
  nonce: string;
  verifier: string;
  next: string;
}

export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

/** Builds the Microsoft sign-in URL plus the values to keep in a short-lived cookie until the callback. */
export function beginMicrosoftLogin(next: string | null): { url: string; pending: PendingMicrosoftLogin } {
  const clientId = env.microsoftClientId;
  if (!clientId || !microsoftEnabled()) throw new AppError("Microsoft sign-in is not set up.", 404);
  const pending: PendingMicrosoftLogin = { state: randomToken(24), nonce: randomToken(24), verifier: randomToken(48), next: safeNext(next) };
  const challenge = createHash("sha256").update(pending.verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: microsoftRedirectUri(),
    response_mode: "query",
    scope: "openid profile email",
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return { url: `${AUTHORITY}/authorize?${params}`, pending };
}

/** Exchanges the code, checks the ID token is from a Sunway directory and starts a member session. */
export async function completeMicrosoftLogin(
  pending: PendingMicrosoftLogin,
  query: { code: string | null; state: string | null },
  ipKey: string,
  ctx: SessionContext,
): Promise<NewSession> {
  await enforce("verify-ip", ipKey, LIMITS.codeVerifyPerIp.limit, LIMITS.codeVerifyPerIp.window);
  const clientId = env.microsoftClientId;
  const clientSecret = env.microsoftClientSecret;
  if (!clientId || !clientSecret) throw new AppError("Microsoft sign-in is not set up.", 404);
  if (!query.code || !query.state || query.state !== pending.state) throw new AppError("This sign-in link has expired. Please try again.");

  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: query.code,
      redirect_uri: microsoftRedirectUri(),
      code_verifier: pending.verifier,
      scope: "openid profile email",
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { id_token?: string; error?: string } | null;
  if (!res.ok || !body?.id_token) {
    console.error("microsoft token exchange failed:", res.status, body?.error ?? "unknown");
    throw new AppError("Microsoft sign-in didn't complete. Please try again.");
  }

  // The token came straight from Microsoft's token endpoint over TLS in exchange
  // for our client secret, so its signature doesn't need checking again
  // (OpenID Connect Core 3.1.3.7). Every claim we rely on is still checked.
  let email: string;
  try {
    email = emailFromMicrosoftClaims(decodeJwtPayload(body.id_token), {
      clientId,
      nonce: pending.nonce,
      allowedDomains: env.allowedEmailDomains,
      adminEmail: env.adminEmail,
    });
  } catch (err) {
    if (err instanceof MicrosoftClaimError) throw new AppError(MS_REFUSED, 403);
    throw err;
  }
  return signInMember(email, ctx, MS_REFUSED);
}
