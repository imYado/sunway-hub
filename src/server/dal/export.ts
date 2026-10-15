import "server-only";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import * as schema from "@/db/schema";
import type { Actor } from "../actor-types";
import { audit } from "../audit";
import { requireRecentAuth } from "./admin";

// Tables included in the admin full backup. Secrets are excluded on purpose:
// sessions, one-time codes, admin credentials and rate-limit counters.
const EXPORT_TABLES: PgTable[] = [
  schema.users,
  schema.userConsents,
  schema.legalDocuments,
  schema.subjects,
  schema.subjectFollows,
  schema.clubs,
  schema.clubFollows,
  schema.clubManagers,
  schema.clubManagerRequests,
  schema.posts,
  schema.timetableEntries,
  schema.studyGroups,
  schema.studyGroupMembers,
  schema.groupPlans,
  schema.groupPlanAttendees,
  schema.postSubjects,
  schema.postTitleHistory,
  schema.events,
  schema.eventRsvps,
  schema.postVotes,
  schema.comments,
  schema.commentVotes,
  schema.conversations,
  schema.directMessages,
  schema.deletedAccounts,
  schema.bookmarks,
  schema.storedFiles,
  schema.userAvatars,
  schema.uploadQuotas,
  schema.reports,
  schema.blockedWords,
  schema.allowedWords,
  schema.siteSettings,
  schema.notifications,
  schema.notificationSettings,
  schema.contactMessages,
  schema.auditLog,
];

export const EXPORTABLE_TABLE_NAMES = EXPORT_TABLES.map((t) => getTableName(t));

export async function exportTable(actor: Actor, name: string): Promise<Record<string, unknown>[]> {
  requireRecentAuth(actor);
  const table = EXPORT_TABLES.find((t) => getTableName(t) === name);
  if (!table) throw new Error("Unknown table");
  const cols = getTableColumns(table);
  const rows = (await db.select().from(table)) as Record<string, unknown>[];
  // Drop generated search vectors from exports.
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(cols)) if (key !== "search") out[key] = r[key];
    return out;
  });
}

export async function fullBackup(actor: Actor) {
  requireRecentAuth(actor);
  const data: Record<string, unknown[]> = {};
  for (const t of EXPORT_TABLES) data[getTableName(t)] = await exportTable(actor, getTableName(t));
  const [{ version }] = (await db.execute<{ version: string }>(sql`select version()`)).rows;
  await audit(actor, "data.full_export");
  return {
    format: "sunway-hub-backup",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    postgres: version,
    note: "Files are stored in Vercel Blob and are not included. Restore the database with Neon point-in-time restore; see README.",
    tables: data,
  };
}
