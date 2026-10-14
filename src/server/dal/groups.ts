import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { groupPlanAttendees, groupPlans, studyGroupMembers, studyGroups, timetableEntries, users } from "@/db/schema";
import { randomToken } from "@/lib/crypto";
import { klDayKey } from "@/lib/dates";
import { GROUP_DESCRIPTION_MAX, GROUP_MAX_MEMBERS, GROUP_NAME_MAX, GROUPS_PER_USER, PLAN_NOTES_MAX, TIMETABLE_LABEL_MAX, titleSchema } from "@/lib/rules";
import { addDays, freeWindows, isDayKey, parseTime, weekDays, type Interval } from "@/lib/schedule";
import type { Actor } from "../actor-types";
import { audit } from "../audit";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { assertClean } from "../profanity";
import { enforce, LIMITS } from "../rate-limit";
import { notify } from "./notifications";

// Study groups are private: members join with an invite link, see when everyone is free
// (from their timetables, as busy/free only), and put plans on the group's calendar.
// The admin can open any group to handle reports.

type Group = typeof studyGroups.$inferSelect;

async function write(actor: Actor) {
  await enforce("write", actor.id, LIMITS.writePerUser.limit, LIMITS.writePerUser.window);
}

function newInviteCode() {
  return randomToken(9);
}

async function loadGroup(id: string): Promise<Group> {
  if (!z.string().uuid().safeParse(id).success) throw new NotFoundError();
  const [g] = await db.select().from(studyGroups).where(eq(studyGroups.id, id)).limit(1);
  if (!g || g.deletedAt) throw new NotFoundError();
  return g;
}

async function isMember(groupId: string, userId: string): Promise<boolean> {
  const [m] = await db
    .select({ userId: studyGroupMembers.userId })
    .from(studyGroupMembers)
    .where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, userId)))
    .limit(1);
  return !!m;
}

/** Members (and the admin) can open a group. A group hidden by reports is closed to members until the admin reviews it. */
async function groupFor(actor: Actor, id: string): Promise<Group & { member: boolean }> {
  const g = await loadGroup(id);
  const member = await isMember(g.id, actor.id);
  if (actor.isAdmin) return { ...g, member };
  if (!member || g.hiddenByReports) throw new NotFoundError();
  return { ...g, member };
}

async function memberCount(groupId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(studyGroupMembers).where(eq(studyGroupMembers.groupId, groupId));
  return r?.n ?? 0;
}

async function assertGroupRoom(userId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(studyGroupMembers)
    .innerJoin(studyGroups, eq(studyGroups.id, studyGroupMembers.groupId))
    .where(and(eq(studyGroupMembers.userId, userId), isNull(studyGroups.deletedAt)));
  if ((r?.n ?? 0) >= GROUPS_PER_USER) throw new AppError(`You can be in at most ${GROUPS_PER_USER} study groups. Leave one first.`);
}

export const groupSchema = z.object({
  name: z.string().trim().min(3, "Group names need at least 3 characters.").max(GROUP_NAME_MAX, `Group names can be at most ${GROUP_NAME_MAX} characters.`),
  description: z.string().trim().max(GROUP_DESCRIPTION_MAX, `Descriptions can be at most ${GROUP_DESCRIPTION_MAX} characters.`).default(""),
});

export async function createGroup(actor: Actor, raw: z.input<typeof groupSchema>): Promise<string> {
  const input = groupSchema.parse(raw);
  await write(actor);
  await assertClean(input.name, input.description);
  await assertGroupRoom(actor.id);
  return db.transaction(async (tx) => {
    const [g] = await tx.insert(studyGroups).values({ ownerId: actor.id, name: input.name, description: input.description, inviteCode: newInviteCode() }).returning({ id: studyGroups.id });
    await tx.insert(studyGroupMembers).values({ groupId: g.id, userId: actor.id });
    return g.id;
  });
}

export async function updateGroup(actor: Actor, id: string, raw: z.input<typeof groupSchema>) {
  const input = groupSchema.parse(raw);
  const g = await loadGroup(id);
  if (g.ownerId !== actor.id) throw new ForbiddenError();
  await assertClean(input.name, input.description);
  await db.update(studyGroups).set({ name: input.name, description: input.description }).where(eq(studyGroups.id, id));
}

export async function myGroups(actor: Actor) {
  const count = sql<number>`(select count(*)::int from ${studyGroupMembers} m where m.group_id = ${studyGroups.id})`;
  const nextPlan = sql<string | null>`(select min(p.date)::text from ${groupPlans} p where p.group_id = ${studyGroups.id} and p.deleted_at is null and p.date >= ${klDayKey()})`;
  return db
    .select({ id: studyGroups.id, name: studyGroups.name, description: studyGroups.description, ownerId: studyGroups.ownerId, hidden: studyGroups.hiddenByReports, members: count, nextPlan })
    .from(studyGroupMembers)
    .innerJoin(studyGroups, eq(studyGroups.id, studyGroupMembers.groupId))
    .where(and(eq(studyGroupMembers.userId, actor.id), isNull(studyGroups.deletedAt)))
    .orderBy(asc(studyGroups.name));
}

// ---------------------------------------------------------------------------
// Invites and membership
// ---------------------------------------------------------------------------
async function groupByCode(code: string): Promise<Group> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(code)) throw new NotFoundError();
  const [g] = await db.select().from(studyGroups).where(and(eq(studyGroups.inviteCode, code), isNull(studyGroups.deletedAt))).limit(1);
  if (!g || g.hiddenByReports) throw new NotFoundError();
  return g;
}

export async function previewInvite(actor: Actor, code: string) {
  const g = await groupByCode(code);
  const [owner] = await db.select({ username: users.username, name: users.displayName }).from(users).where(eq(users.id, g.ownerId)).limit(1);
  const members = await memberCount(g.id);
  return { id: g.id, name: g.name, description: g.description, owner, members, full: members >= GROUP_MAX_MEMBERS, joined: await isMember(g.id, actor.id) };
}

export async function joinGroup(actor: Actor, code: string): Promise<string> {
  const g = await groupByCode(code);
  if (await isMember(g.id, actor.id)) return g.id;
  await write(actor);
  if ((await memberCount(g.id)) >= GROUP_MAX_MEMBERS) throw new AppError(`This group is full (${GROUP_MAX_MEMBERS} members).`);
  await assertGroupRoom(actor.id);
  await db.insert(studyGroupMembers).values({ groupId: g.id, userId: actor.id }).onConflictDoNothing();
  await notify([g.ownerId], { kind: "followed", title: `@${actor.username} joined "${g.name}"`, link: `/study-groups/${g.id}`, dedupeKey: `group-join:${g.id}:${actor.id}` });
  return g.id;
}

export async function resetInvite(actor: Actor, id: string) {
  const g = await loadGroup(id);
  if (g.ownerId !== actor.id) throw new ForbiddenError();
  await db.update(studyGroups).set({ inviteCode: newInviteCode() }).where(eq(studyGroups.id, id));
}

/** The owner leaving hands the group to the longest-standing member; the last member leaving deletes it. */
async function removeFromGroup(g: Group, userId: string, by: string | null) {
  await db.delete(studyGroupMembers).where(and(eq(studyGroupMembers.groupId, g.id), eq(studyGroupMembers.userId, userId)));
  await db.delete(groupPlanAttendees).where(
    and(eq(groupPlanAttendees.userId, userId), inArray(groupPlanAttendees.planId, db.select({ id: groupPlans.id }).from(groupPlans).where(eq(groupPlans.groupId, g.id)))),
  );
  if (g.ownerId !== userId) return;
  const [next] = await db
    .select({ userId: studyGroupMembers.userId })
    .from(studyGroupMembers)
    .innerJoin(users, eq(users.id, studyGroupMembers.userId))
    .where(and(eq(studyGroupMembers.groupId, g.id), eq(users.status, "active")))
    .orderBy(asc(studyGroupMembers.joinedAt))
    .limit(1);
  if (next) {
    await db.update(studyGroups).set({ ownerId: next.userId }).where(eq(studyGroups.id, g.id));
    await notify([next.userId], { kind: "system", title: `You now run the study group "${g.name}"`, link: `/study-groups/${g.id}` });
  } else {
    await db.update(studyGroups).set({ deletedAt: new Date(), deletedBy: by, deleteReason: "Last member left" }).where(eq(studyGroups.id, g.id));
  }
}

export async function leaveGroup(actor: Actor, id: string) {
  const g = await loadGroup(id);
  if (!(await isMember(g.id, actor.id))) return;
  await removeFromGroup(g, actor.id, actor.id);
}

export async function removeMember(actor: Actor, id: string, userId: string) {
  const g = await loadGroup(id);
  if (g.ownerId !== actor.id && !actor.isAdmin) throw new ForbiddenError();
  if (userId === actor.id) throw new AppError("Use Leave group instead.");
  if (!(await isMember(g.id, userId))) return;
  await removeFromGroup(g, userId, actor.id);
  await notify([userId], { kind: "system", title: `You were removed from the study group "${g.name}"` });
}

/** The owner can delete their group; the admin can delete any group but must give a reason. */
export async function deleteGroup(actor: Actor, id: string, reason?: string) {
  const g = await loadGroup(id);
  const byAdminForOther = actor.isAdmin && g.ownerId !== actor.id;
  if (g.ownerId !== actor.id && !actor.isAdmin) throw new ForbiddenError();
  const cleanReason = reason?.trim().slice(0, 500) || null;
  if (byAdminForOther && !cleanReason) throw new AppError("Please give a reason. It will be sent to the group's members.");
  await db.update(studyGroups).set({ deletedAt: new Date(), deletedBy: actor.id, deleteReason: cleanReason }).where(eq(studyGroups.id, id));
  await audit(actor, `study_group.delete_by_${byAdminForOther ? "admin" : "owner"}`, { type: "study_group", id }, cleanReason);
  const members = await db.select({ userId: studyGroupMembers.userId }).from(studyGroupMembers).where(eq(studyGroupMembers.groupId, id));
  await notify(
    members.map((m) => m.userId).filter((u) => u !== actor.id),
    { kind: "system", title: `The study group "${g.name}" was deleted`, body: byAdminForOther ? `Reason: ${cleanReason}` : null },
  );
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------
export const planSchema = z
  .object({
    title: titleSchema,
    kind: z.enum(["study", "outing", "other"]).default("study"),
    date: z.string().refine(isDayKey, "Choose a date."),
    start: z.string().default(""),
    end: z.string().default(""),
    location: z.string().trim().max(TIMETABLE_LABEL_MAX).default(""),
    notes: z.string().trim().max(PLAN_NOTES_MAX, `Notes can be at most ${PLAN_NOTES_MAX} characters.`).default(""),
  })
  .transform((v, ctx) => {
    const startMin = v.start ? parseTime(v.start) : null;
    const endMin = v.end ? parseTime(v.end) : null;
    if ((v.start && startMin === null) || (v.end && endMin === null)) {
      ctx.addIssue({ code: "custom", message: "Enter times like 14:30." });
      return z.NEVER;
    }
    if (endMin !== null && startMin === null) {
      ctx.addIssue({ code: "custom", message: "Add a start time too, or leave both empty." });
      return z.NEVER;
    }
    if (startMin !== null && endMin !== null && endMin <= startMin) {
      ctx.addIssue({ code: "custom", message: "The end time must be after the start time." });
      return z.NEVER;
    }
    const today = klDayKey();
    if (v.date < addDays(today, -1) || v.date > addDays(today, 366)) {
      ctx.addIssue({ code: "custom", message: "Choose a date within the next year." });
      return z.NEVER;
    }
    return { title: v.title, kind: v.kind, date: v.date, startMin, endMin, location: v.location, notes: v.notes };
  });

export async function createPlan(actor: Actor, groupId: string, raw: z.input<typeof planSchema>): Promise<string> {
  const input = planSchema.parse(raw);
  const g = await groupFor(actor, groupId);
  if (!g.member) throw new ForbiddenError();
  await write(actor);
  await assertClean(input.title, input.location, input.notes);
  const [plan] = await db.insert(groupPlans).values({ groupId, createdBy: actor.id, ...input }).returning({ id: groupPlans.id });
  await db.insert(groupPlanAttendees).values({ planId: plan.id, userId: actor.id });
  const others = await db
    .select({ userId: studyGroupMembers.userId })
    .from(studyGroupMembers)
    .where(and(eq(studyGroupMembers.groupId, groupId), ne(studyGroupMembers.userId, actor.id)));
  await notify(
    others.map((o) => o.userId),
    { kind: "followed", title: `New plan in "${g.name}": ${input.title}`, link: `/study-groups/${groupId}?week=${input.date}` },
  );
  return plan.id;
}

async function loadPlan(planId: string) {
  if (!z.string().uuid().safeParse(planId).success) throw new NotFoundError();
  const [p] = await db.select().from(groupPlans).where(and(eq(groupPlans.id, planId), isNull(groupPlans.deletedAt))).limit(1);
  if (!p) throw new NotFoundError();
  return p;
}

export async function togglePlanGoing(actor: Actor, planId: string): Promise<boolean> {
  const p = await loadPlan(planId);
  const g = await groupFor(actor, p.groupId);
  if (!g.member) throw new ForbiddenError();
  const where = and(eq(groupPlanAttendees.planId, planId), eq(groupPlanAttendees.userId, actor.id));
  const [existing] = await db.select().from(groupPlanAttendees).where(where).limit(1);
  if (existing) {
    await db.delete(groupPlanAttendees).where(where);
    return false;
  }
  await db.insert(groupPlanAttendees).values({ planId, userId: actor.id }).onConflictDoNothing();
  return true;
}

export async function deletePlan(actor: Actor, planId: string): Promise<string> {
  const p = await loadPlan(planId);
  const g = await groupFor(actor, p.groupId);
  if (p.createdBy !== actor.id && g.ownerId !== actor.id && !actor.isAdmin) throw new ForbiddenError();
  await db.update(groupPlans).set({ deletedAt: new Date() }).where(eq(groupPlans.id, planId));
  return p.groupId;
}

// ---------------------------------------------------------------------------
// The group's week: who is free when, and what is planned
// ---------------------------------------------------------------------------
export interface PlanItem {
  id: string;
  groupId: string;
  groupName: string;
  title: string;
  kind: "study" | "outing" | "other";
  date: string;
  startMin: number | null;
  endMin: number | null;
  location: string;
  notes: string;
  createdBy: string;
  creatorUsername: string | null;
  going: number;
  imGoing: boolean;
}

async function plansBetween(actor: Actor, groupIds: string[], fromKey: string, toKey: string): Promise<PlanItem[]> {
  if (groupIds.length === 0) return [];
  const going = sql<number>`(select count(*)::int from ${groupPlanAttendees} a where a.plan_id = ${groupPlans.id})`;
  const imGoing = sql<boolean>`exists (select 1 from ${groupPlanAttendees} a where a.plan_id = ${groupPlans.id} and a.user_id = ${actor.id})`;
  return db
    .select({
      id: groupPlans.id,
      groupId: groupPlans.groupId,
      groupName: studyGroups.name,
      title: groupPlans.title,
      kind: groupPlans.kind,
      date: groupPlans.date,
      startMin: groupPlans.startMin,
      endMin: groupPlans.endMin,
      location: groupPlans.location,
      notes: groupPlans.notes,
      createdBy: groupPlans.createdBy,
      creatorUsername: users.username,
      going,
      imGoing,
    })
    .from(groupPlans)
    .innerJoin(studyGroups, eq(studyGroups.id, groupPlans.groupId))
    .innerJoin(users, eq(users.id, groupPlans.createdBy))
    .where(and(inArray(groupPlans.groupId, groupIds), isNull(groupPlans.deletedAt), gte(groupPlans.date, fromKey), lte(groupPlans.date, toKey)))
    .orderBy(asc(groupPlans.date), sql`${groupPlans.startMin} nulls first`);
}

/** Plans in every group the member belongs to (for their own schedule). */
export async function myPlans(actor: Actor, fromKey: string, toKey: string): Promise<PlanItem[]> {
  const groups = await db
    .select({ id: studyGroups.id })
    .from(studyGroupMembers)
    .innerJoin(studyGroups, eq(studyGroups.id, studyGroupMembers.groupId))
    .where(and(eq(studyGroupMembers.userId, actor.id), isNull(studyGroups.deletedAt), eq(studyGroups.hiddenByReports, false)));
  return plansBetween(
    actor,
    groups.map((g) => g.id),
    fromKey,
    toKey,
  );
}

export async function getGroupWeek(actor: Actor, id: string, monday: string) {
  const g = await groupFor(actor, id);
  const members = await db
    .select({
      userId: users.id,
      username: users.username,
      name: users.displayName,
      joinedAt: studyGroupMembers.joinedAt,
      slots: sql<number>`(select count(*)::int from ${timetableEntries} t where t.user_id = ${users.id})`,
    })
    .from(studyGroupMembers)
    .innerJoin(users, eq(users.id, studyGroupMembers.userId))
    .where(and(eq(studyGroupMembers.groupId, id), eq(users.status, "active")))
    .orderBy(asc(studyGroupMembers.joinedAt));
  const ids = members.map((m) => m.userId);
  const busy = ids.length
    ? await db
        .select({ day: timetableEntries.day, startMin: timetableEntries.startMin, endMin: timetableEntries.endMin, userId: timetableEntries.userId })
        .from(timetableEntries)
        .where(inArray(timetableEntries.userId, ids))
    : [];
  const days = weekDays(monday);
  const plans = await plansBetween(actor, [id], days[0], days[6]);
  const withTimetable = new Set(busy.map((b) => b.userId)).size;
  const week = days.map((date, day) => {
    const blocks: Interval[] = busy.filter((b) => b.day === day).map((b) => ({ start: b.startMin, end: b.endMin }));
    return { date, free: freeWindows(blocks), plans: plans.filter((p) => p.date === date) };
  });
  const { inviteCode, ...group } = g;
  return {
    group,
    // Every member can share the invite link; only the owner can reset it.
    inviteCode: g.member ? inviteCode : null,
    isOwner: g.ownerId === actor.id,
    members: members.map((m) => ({ ...m, hasTimetable: m.slots > 0, isOwner: m.userId === g.ownerId })),
    withTimetable,
    week,
  };
}

// ---------------------------------------------------------------------------
// Reports, account erasure, export and purge
// ---------------------------------------------------------------------------
export async function describeGroup(id: string, viewerId: string) {
  const [g] = await db.select().from(studyGroups).where(eq(studyGroups.id, id)).limit(1);
  if (!g) return null;
  return {
    ownerId: g.ownerId,
    hidden: g.hiddenByReports,
    deleted: !!g.deletedAt,
    viewerIsMember: await isMember(id, viewerId),
    label: `Study group: ${g.name}`,
    link: `/study-groups/${id}`,
  };
}

export async function setGroupHidden(id: string, hidden: boolean) {
  await db.update(studyGroups).set({ hiddenByReports: hidden }).where(eq(studyGroups.id, id));
}

/** Deleting an account: their timetable goes, they leave every group, and with "delete posts" their plans go too. */
export async function eraseScheduleData(userId: string, deletePlans: boolean) {
  await db.delete(timetableEntries).where(eq(timetableEntries.userId, userId));
  const groups = await db
    .select()
    .from(studyGroups)
    .innerJoin(studyGroupMembers, eq(studyGroupMembers.groupId, studyGroups.id))
    .where(and(eq(studyGroupMembers.userId, userId), isNull(studyGroups.deletedAt)));
  for (const { study_groups: g } of groups) await removeFromGroup(g, userId, userId);
  if (deletePlans) await db.update(groupPlans).set({ deletedAt: new Date() }).where(and(eq(groupPlans.createdBy, userId), isNull(groupPlans.deletedAt)));
}

/** Hard-deletes groups and plans that were deleted before the cutoff, and plans long in the past. */
export async function purgeGroups(cutoff: Date): Promise<number> {
  const plans = await db
    .delete(groupPlans)
    .where(sql`(${groupPlans.deletedAt} is not null and ${groupPlans.deletedAt} < ${cutoff}) or ${groupPlans.date} < ${addDays(klDayKey(), -365)}`)
    .returning({ id: groupPlans.id });
  const groups = await db
    .delete(studyGroups)
    .where(sql`${studyGroups.deletedAt} is not null and ${studyGroups.deletedAt} < ${cutoff}`)
    .returning({ id: studyGroups.id });
  return plans.length + groups.length;
}

export async function myScheduleData(userId: string) {
  return {
    timetable: await db.select().from(timetableEntries).where(eq(timetableEntries.userId, userId)),
    studyGroupMemberships: await db
      .select({ groupId: studyGroups.id, name: studyGroups.name, joinedAt: studyGroupMembers.joinedAt })
      .from(studyGroupMembers)
      .innerJoin(studyGroups, eq(studyGroups.id, studyGroupMembers.groupId))
      .where(eq(studyGroupMembers.userId, userId)),
    groupPlansCreated: await db.select().from(groupPlans).where(eq(groupPlans.createdBy, userId)).orderBy(desc(groupPlans.date)),
  };
}
