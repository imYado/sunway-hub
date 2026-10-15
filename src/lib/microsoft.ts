/**
 * Rules for "Sign in with Microsoft". Only Sunway's own Microsoft 365
 * directories are accepted, and each directory may only vouch for the email
 * domain it owns, so another organisation's tenant can never sign someone in
 * as a Sunway address.
 *
 * The address comes from `preferred_username` (the account's sign-in name,
 * which only Sunway's IT can set), never from the `email` claim, which some
 * tenants let users edit.
 */
import { isAdminEmail, isAllowedMemberEmail, normaliseEmail, emailDomain } from "./email-domain";

/** Directory (tenant) id → the email domains that directory may vouch for. */
export const SUNWAY_TENANTS: Record<string, string[]> = {
  "537c2be1-fcd4-45a9-83b3-6653eacc5070": ["imail.sunway.edu.my"],
  "051008eb-db40-4249-9ece-9df3e8c3f594": ["sunway.edu.my"],
};

export interface IdTokenClaims {
  iss?: unknown;
  aud?: unknown;
  tid?: unknown;
  nonce?: unknown;
  exp?: unknown;
  preferred_username?: unknown;
}

export class MicrosoftClaimError extends Error {}

export function decodeJwtPayload(jwt: string): IdTokenClaims {
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new MicrosoftClaimError("malformed token");
  try {
    const json = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!json || typeof json !== "object") throw new Error();
    return json as IdTokenClaims;
  } catch {
    throw new MicrosoftClaimError("malformed token");
  }
}

/** Returns the member email the token proves, or throws. */
export function emailFromMicrosoftClaims(
  claims: IdTokenClaims,
  opts: { clientId: string; nonce: string; allowedDomains: string[]; adminEmail: string; now?: number; tenants?: Record<string, string[]> },
): string {
  const tenants = opts.tenants ?? SUNWAY_TENANTS;
  const tid = typeof claims.tid === "string" ? claims.tid.toLowerCase() : "";
  const domains = Object.prototype.hasOwnProperty.call(tenants, tid) ? tenants[tid] : undefined;
  if (!domains) throw new MicrosoftClaimError("not a Sunway account");
  if (claims.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) throw new MicrosoftClaimError("wrong issuer");
  if (claims.aud !== opts.clientId) throw new MicrosoftClaimError("wrong audience");
  if (typeof claims.nonce !== "string" || claims.nonce !== opts.nonce) throw new MicrosoftClaimError("wrong nonce");
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  if (typeof claims.exp !== "number" || claims.exp < now - 60) throw new MicrosoftClaimError("expired");
  if (typeof claims.preferred_username !== "string") throw new MicrosoftClaimError("no username");

  const email = normaliseEmail(claims.preferred_username);
  const domain = emailDomain(email);
  if (!domain || !domains.includes(domain)) throw new MicrosoftClaimError("domain does not match directory");
  if (!isAllowedMemberEmail(email, opts.allowedDomains)) throw new MicrosoftClaimError("domain not allowed");
  // The admin account always signs in with its password.
  if (isAdminEmail(email, opts.adminEmail)) throw new MicrosoftClaimError("admin");
  return email;
}
