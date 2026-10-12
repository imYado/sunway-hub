import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { legalDocuments, userConsents } from "@/db/schema";
import { PRIVACY_TEMPLATE } from "@/content/legal/privacy";
import { TERMS_TEMPLATE } from "@/content/legal/terms";

export type LegalType = "terms" | "privacy";

export const LEGAL_TEMPLATES: Record<LegalType, string> = { terms: TERMS_TEMPLATE, privacy: PRIVACY_TEMPLATE };

export interface LegalDoc {
  type: LegalType;
  version: number;
  body: string;
  publishedAt: Date | null;
}

/** Ensures version 1 of each document exists (from the draft templates). Idempotent. */
export async function ensureLegalSeeded() {
  for (const type of ["terms", "privacy"] as const) {
    await db.insert(legalDocuments).values({ type, version: 1, body: LEGAL_TEMPLATES[type] }).onConflictDoNothing();
  }
}

export async function getLatestLegal(type: LegalType): Promise<LegalDoc> {
  const [row] = await db.select().from(legalDocuments).where(eq(legalDocuments.type, type)).orderBy(desc(legalDocuments.version)).limit(1);
  if (row) return { type, version: row.version, body: row.body, publishedAt: row.publishedAt };
  return { type, version: 1, body: LEGAL_TEMPLATES[type], publishedAt: null };
}

export async function latestVersions(): Promise<Record<LegalType, number>> {
  const [t, p] = await Promise.all([getLatestLegal("terms"), getLatestLegal("privacy")]);
  return { terms: t.version, privacy: p.version };
}

export async function needsConsent(userId: string): Promise<boolean> {
  const latest = await latestVersions();
  for (const type of ["terms", "privacy"] as const) {
    const [c] = await db
      .select({ version: userConsents.version })
      .from(userConsents)
      .where(and(eq(userConsents.userId, userId), eq(userConsents.docType, type)))
      .orderBy(desc(userConsents.version))
      .limit(1);
    if (!c || c.version < latest[type]) return true;
  }
  return false;
}

export async function recordConsent(userId: string) {
  await ensureLegalSeeded();
  const latest = await latestVersions();
  await db.insert(userConsents).values([
    { userId, docType: "terms", version: latest.terms },
    { userId, docType: "privacy", version: latest.privacy },
  ]);
}

export async function publishLegal(type: LegalType, body: string, publishedBy: string): Promise<number> {
  await ensureLegalSeeded();
  const latest = await getLatestLegal(type);
  const version = latest.version + 1;
  await db.insert(legalDocuments).values({ type, version, body, publishedBy });
  return version;
}
