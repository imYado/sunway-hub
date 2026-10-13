/**
 * Email normalisation and access rules.
 *
 * - Emails are trimmed and lower-cased before any check.
 * - A member email must have EXACTLY one "@" and its domain must equal one of
 *   the allowed domains (no suffix/prefix matching, so lookalikes such as
 *   "imail.sunway.edu.my.evil.com" or "xsunway.edu.my" are rejected).
 * - The only non-allowed-domain address that may ever sign in is ADMIN_EMAIL.
 */

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normaliseEmail(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export function isValidEmailShape(email: string): boolean {
  if (email.length > 254) return false;
  if (email.split("@").length !== 2) return false;
  return EMAIL_RE.test(email);
}

export function emailDomain(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return parts[1];
}

export function isAdminEmail(rawEmail: string, adminEmail: string): boolean {
  const email = normaliseEmail(rawEmail);
  const admin = normaliseEmail(adminEmail);
  return admin.length > 0 && isValidEmailShape(email) && email === admin;
}

export function isAllowedMemberEmail(rawEmail: string, allowedDomains: string[]): boolean {
  const email = normaliseEmail(rawEmail);
  if (!isValidEmailShape(email)) return false;
  const domain = emailDomain(email);
  if (!domain) return false;
  return allowedDomains.map((d) => normaliseEmail(d)).some((d) => d.length > 0 && domain === d);
}

export type EmailClass = "admin" | "member" | "rejected";

export function classifyEmail(rawEmail: string, opts: { adminEmail: string; allowedDomains: string[] }): EmailClass {
  if (isAdminEmail(rawEmail, opts.adminEmail)) return "admin";
  if (isAllowedMemberEmail(rawEmail, opts.allowedDomains)) return "member";
  return "rejected";
}
