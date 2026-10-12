import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import type { FileKind } from "@/lib/files";

export interface SiteSettings {
  uploadsPerDay: number;
  userStorageMb: number;
  enabledFileKinds: FileKind[];
  requireReapprovalAfterTitleEdit: boolean;
  announcement: string;
  maintenanceMode: boolean;
}

export const DEFAULT_SETTINGS: SiteSettings = {
  uploadsPerDay: 10,
  userStorageMb: 200,
  enabledFileKinds: ["image", "pdf", "docx", "pptx", "video"],
  requireReapprovalAfterTitleEdit: false,
  announcement: "",
  maintenanceMode: false,
};

let cache: { at: number; value: SiteSettings } | null = null;
const TTL_MS = 15_000;

export async function getSettings(): Promise<SiteSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await db
    .select()
    .from(siteSettings)
    .where(inArray(siteSettings.key, Object.keys(DEFAULT_SETTINGS)));
  const value: SiteSettings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    (value as unknown as Record<string, unknown>)[row.key] = row.value;
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSettings(patch: Partial<SiteSettings>): Promise<void> {
  for (const [key, value] of Object.entries(patch)) {
    await db
      .insert(siteSettings)
      .values({ key, value: value as object })
      .onConflictDoUpdate({ target: siteSettings.key, set: { value: value as object, updatedAt: new Date() } });
  }
  cache = null;
}

export function clearSettingsCache() {
  cache = null;
}
