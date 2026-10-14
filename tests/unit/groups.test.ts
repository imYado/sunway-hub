import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clubFollows, clubs, events, posts, rateLimits, studyGroups, users } from "@/db/schema";
import { klDayKey } from "@/lib/dates";
import { addDays, weekStart } from "@/lib/schedule";
import type { Actor } from "@/server/actor-types";
import { resolveReports } from "@/server/dal/admin";
import {
  createGroup,
  createPlan,
  deleteGroup,
  deletePlan,
  getGroupWeek,
  joinGroup,
  leaveGroup,
  myGroups,
  myPlans,
  previewInvite,
  removeMember,
  togglePlanGoing,
} from "@/server/dal/groups";
import { createReport } from "@/server/dal/reports";
import { addTimetableSlot, eventsForSchedule, importTimetable, myTimetable, saveCalendarPrefs } from "@/server/dal/schedule";
import { eraseUser } from "@/server/dal/users";
import { hasDb, makeUser, resetDb } from "./db-helpers";

let admin: Actor;
let alice: Actor;
let bob: Actor;
let carol: Actor;
const monday = weekStart(klDayKey());

async function inviteCode(groupId: string) {
  const [g] = await db.select({ code: studyGroups.inviteCode }).from(studyGroups).where(eq(studyGroups.id, groupId));
  return g.code;
}

describe.skipIf(!hasDb)("timetables, study groups and plans", () => {
  beforeAll(async () => {
    await resetDb();
    admin = await makeUser({ admin: true });
    alice = await makeUser();
    bob = await makeUser();
    carol = await makeUser();
  });
  beforeEach(async () => {
    await db.delete(rateLimits);
  });

  it("timetable slots are validated and private to their owner", async () => {
    await expect(addTimetableSlot(alice, { day: 0, start: "10:00", end: "09:00", label: "Backwards" })).rejects.toThrow(/after/);
    await expect(addTimetableSlot(alice, { day: 0, start: "09:00", end: "10:00", label: "Class of shit" })).rejects.toThrow();
    await addTimetableSlot(alice, { day: 0, start: "09:00", end: "11:00", label: "CSC1024 Lecture", location: "LT 5" });
    expect((await myTimetable(alice)).map((s) => s.label)).toEqual(["CSC1024 Lecture"]);
    expect(await myTimetable(bob)).toEqual([]);
  });

  it("importing a calendar file replaces the timetable", async () => {
    const file = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Lab\r\nDTSTART:20260113T060000Z\r\nDTEND:20260113T080000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    expect(await importTimetable(bob, Buffer.from(file), true)).toBe(1);
    expect((await myTimetable(bob)).map((s) => [s.day, s.startMin, s.label])).toEqual([[1, 840, "Lab"]]);
    await expect(importTimetable(bob, Buffer.from("not a calendar"), true)).rejects.toThrow(/calendar/);
  });

  it("groups are private, joined by invite link, and show shared free time without class names", async () => {
    const id = await createGroup(alice, { name: "Revision crew", description: "" });
    await expect(getGroupWeek(bob, id, monday)).rejects.toThrow();
    const code = await inviteCode(id);
    expect((await previewInvite(bob, code)).members).toBe(1);
    await expect(previewInvite(bob, "wrongcode123")).rejects.toThrow();
    expect(await joinGroup(bob, code)).toBe(id);
    expect((await myGroups(bob)).map((g) => g.id)).toEqual([id]);

    const week = await getGroupWeek(bob, id, monday);
    expect(week.members).toHaveLength(2);
    expect(week.withTimetable).toBe(2);
    // Monday: Alice has class 09:00-11:00. Tuesday: Bob has a lab 14:00-16:00.
    expect(week.week[0].free).toEqual([
      { start: 480, end: 540 },
      { start: 660, end: 1320 },
    ]);
    expect(week.week[1].free).toEqual([
      { start: 480, end: 840 },
      { start: 960, end: 1320 },
    ]);
    expect(JSON.stringify(week)).not.toContain("CSC1024 Lecture");
    expect(week.inviteCode).toBe(code);
    // The admin can open any group, e.g. to handle reports, but isn't given the invite link.
    expect((await getGroupWeek(admin, id, monday)).inviteCode).toBeNull();
  });

  it("members plan things, mark going, and see them on their own schedule", async () => {
    const [g] = await myGroups(alice);
    const date = addDays(monday, 2);
    await expect(createPlan(carol, g.id, { title: "Library session", date })).rejects.toThrow();
    await expect(createPlan(alice, g.id, { title: "Library session", date, start: "15:00", end: "14:00" })).rejects.toThrow(/after/);
    const planId = await createPlan(alice, g.id, { title: "Library session", date, start: "14:00", end: "16:00", kind: "study" });
    expect(await togglePlanGoing(bob, planId)).toBe(true);
    const [p] = await myPlans(bob, monday, addDays(monday, 6));
    expect(p).toMatchObject({ title: "Library session", going: 2, imGoing: true, groupName: "Revision crew" });
    await expect(deletePlan(carol, planId)).rejects.toThrow();
    await expect(deletePlan(bob, planId)).rejects.toThrow();
    await deletePlan(alice, planId);
    expect(await myPlans(bob, monday, addDays(monday, 6))).toEqual([]);
  });

  it("the owner leaving hands the group over; removed members lose access", async () => {
    const id = await createGroup(carol, { name: "Handover group", description: "" });
    await joinGroup(alice, await inviteCode(id));
    await joinGroup(bob, await inviteCode(id));
    await expect(removeMember(alice, id, bob.id)).rejects.toThrow();
    await leaveGroup(carol, id);
    expect((await getGroupWeek(alice, id, monday)).isOwner).toBe(true);
    await removeMember(alice, id, bob.id);
    await expect(getGroupWeek(bob, id, monday)).rejects.toThrow();
    await leaveGroup(alice, id);
    await expect(getGroupWeek(admin, id, monday)).rejects.toThrow();
  });

  it("only members can report a group; the admin can remove it with a reason", async () => {
    const id = await createGroup(alice, { name: "Reportable group", description: "" });
    await expect(createReport(carol, { targetType: "study_group", targetId: id, reason: "spam" })).rejects.toThrow();
    await joinGroup(carol, await inviteCode(id));
    await expect(createReport(alice, { targetType: "study_group", targetId: id, reason: "spam" })).rejects.toThrow(/own/);
    await createReport(carol, { targetType: "study_group", targetId: id, reason: "spam" });
    await expect(deleteGroup(admin, id)).rejects.toThrow(/reason/);
    await resolveReports(admin, "study_group", id, "remove", "Not a study group");
    await expect(getGroupWeek(carol, id, monday)).rejects.toThrow();
  });

  it("events on the schedule follow the member's choices", async () => {
    const [club] = await db.insert(clubs).values({ slug: "chess", name: "Chess Club", category: "General Interest" }).returning();
    const start = new Date(`${addDays(monday, 3)}T10:00:00+08:00`);
    const mk = async (authorId: string, title: string, clubId: string | null) => {
      const [p] = await db.insert(posts).values({ authorId, type: "event", title, status: "approved", clubId }).returning();
      await db.insert(events).values({ postId: p.id, startsAt: start, location: "Hall" });
    };
    await mk(admin.id, "Chess night", club.id);
    await mk(bob.id, "Bob's open mic", null);
    await db.update(users).set({ roleLabel: "teacher", teacherVerified: true }).where(eq(users.id, carol.id));
    await mk(carol.id, "Extra lecture", null);
    const from = new Date(`${monday}T00:00:00+08:00`);
    const to = new Date(`${addDays(monday, 7)}T00:00:00+08:00`);
    const titles = async () => (await eventsForSchedule(alice, from, to)).map((e) => e.title).sort();

    expect(await titles()).toEqual([]); // follows no clubs yet
    await db.insert(clubFollows).values({ clubId: club.id, userId: alice.id });
    expect(await titles()).toEqual(["Chess night"]);
    await saveCalendarPrefs(alice, { clubs: "none", usernames: [`@${bob.username}`], roles: ["teacher"] });
    expect(await titles()).toEqual(["Bob's open mic", "Extra lecture"]);
    const r = await saveCalendarPrefs(alice, { clubs: "chosen", clubIds: [club.id], usernames: ["nobody_here"] });
    expect(r.unknown).toEqual(["nobody_here"]);
    expect(await titles()).toEqual(["Chess night"]);
  });

  it("deleting an account clears the timetable and memberships", async () => {
    const dave = await makeUser();
    await addTimetableSlot(dave, { day: 3, start: "08:00", end: "09:00", label: "Early class" });
    const id = await createGroup(dave, { name: "Dave's group", description: "" });
    await joinGroup(alice, await inviteCode(id));
    await eraseUser(dave.id, "delete_posts", dave);
    expect(await myTimetable(dave)).toEqual([]);
    const week = await getGroupWeek(alice, id, monday);
    expect(week.isOwner).toBe(true);
    expect(week.members.map((m) => m.userId)).toEqual([alice.id]);
  });
});
