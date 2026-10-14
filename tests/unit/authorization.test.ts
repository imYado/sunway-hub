import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clubs, postTitleHistory, posts, rateLimits, storedFiles, users } from "@/db/schema";
import type { Actor } from "@/server/actor-types";
import {
  banUser,
  dashboard,
  decideAvatar,
  decidePost,
  forceSignOut,
  listWords,
  openReports,
  pendingPosts,
  revertTitle,
  searchUsers,
  suspendUser,
  adminDeleteUser,
  setTeacherVerified,
  setUsername,
} from "@/server/dal/admin";
import { assignClubManager, importSunwayClubs, updateClubAsManager } from "@/server/dal/clubs";
import { fullBackup } from "@/server/dal/export";
import {
  createPost,
  deletePost,
  editPostTitle,
  getFileForViewer,
  getPostDetail,
  listProfilePosts,
  searchPosts,
  toggleHelpful,
} from "@/server/dal/posts";
import { createReport } from "@/server/dal/reports";
import { getAvatarFileForViewer, getProfile, updateProfile, uploadAvatar } from "@/server/dal/users";
import { saveSettings, clearSettingsCache } from "@/server/settings";
import { storage } from "@/server/storage";
import { SUNWAY_CLUBS } from "@/content/clubs-seed";
import { hasDb, makeUser, resetDb } from "./db-helpers";
import { pdfBytes, pngBytes } from "./fixtures";

let admin: Actor;
let alice: Actor;
let bob: Actor;

async function quarantine(actor: Actor, name: string, data: Buffer) {
  const pathname = `quarantine/${actor.id}/${Date.now()}-${name}`;
  await storage().put(pathname, data, "application/octet-stream");
  return { pathname, name };
}

async function newStudyPost(actor: Actor, title = "Week 3 lecture summary", withFile = false) {
  return createPost(actor, {
    type: "study",
    title,
    description: "My own summary of week 3.",
    subjects: ["CSC1024 Programming Principles"],
    semester: "Jan 2026",
    ownWork: true,
    files: withFile ? [await quarantine(actor, "notes.pdf", pdfBytes())] : [],
  });
}

describe.skipIf(!hasDb)("server-side authorisation", () => {
  beforeAll(async () => {
    await resetDb();
    admin = await makeUser({ admin: true });
    alice = await makeUser();
    bob = await makeUser();
  });
  beforeEach(async () => {
    await db.delete(rateLimits);
  });

  it("uploads are pending; members cannot see other people's pending posts", async () => {
    const { id, status } = await newStudyPost(alice);
    expect(status).toBe("pending");
    await expect(getPostDetail(bob, id)).rejects.toThrow(/could not find/);
    expect((await getPostDetail(alice, id)).status).toBe("pending");
    expect((await getPostDetail(admin, id)).status).toBe("pending");
    expect((await searchPosts(bob, {})).items.find((p) => p.id === id)).toBeUndefined();
    await expect(listProfilePosts(bob, alice.id, "pending")).rejects.toThrow(/permission/);
    expect((await listProfilePosts(alice, alice.id, "pending")).map((p) => p.id)).toContain(id);
  });

  it("files of pending posts are only served to the owner and admin", async () => {
    const { id } = await newStudyPost(alice, "Pending post with a file", true);
    const [file] = await db.select().from(storedFiles).where(eq(storedFiles.postId, id));
    expect(file.storagePath.startsWith(`files/${id}/`)).toBe(true);
    expect(await getFileForViewer(bob, file.id)).toBeNull();
    expect(await getFileForViewer(alice, file.id)).not.toBeNull();
    expect(await getFileForViewer(admin, file.id)).not.toBeNull();
    await decidePost(admin, id, { decision: "approve" });
    expect(await getFileForViewer(bob, file.id)).not.toBeNull();
  });

  it("a quarantine path belonging to someone else is refused", async () => {
    const stolen = await quarantine(alice, "notes.pdf", pdfBytes());
    await expect(
      createPost(bob, { type: "study", title: "Stolen upload", subjects: ["X"], ownWork: true, files: [stolen] }),
    ).rejects.toThrow(/Invalid upload/);
  });

  it("the own-work statement must be ticked", async () => {
    await expect(
      // @ts-expect-error ownWork must be literally true
      createPost(alice, { type: "study", title: "No statement", subjects: ["X"], ownWork: false }),
    ).rejects.toThrow();
  });

  it("members cannot reach admin functions", async () => {
    const { id } = await newStudyPost(alice, "Needs a decision");
    await expect(decidePost(bob, id, { decision: "approve" })).rejects.toThrow(/permission/);
    await expect(decidePost(alice, id, { decision: "approve" })).rejects.toThrow(/permission/);
    await expect(dashboard(bob)).rejects.toThrow(/permission/);
    await expect(pendingPosts(bob)).rejects.toThrow(/permission/);
    await expect(searchUsers(bob, "")).rejects.toThrow(/permission/);
    await expect(listWords(bob)).rejects.toThrow(/permission/);
    await expect(openReports(bob)).rejects.toThrow(/permission/);
    await expect(banUser(bob, alice.id, "x")).rejects.toThrow(/permission/);
    await expect(importSunwayClubs(bob)).rejects.toThrow(/permission/);
    await expect(fullBackup(bob)).rejects.toThrow(/permission/);
    await expect(setTeacherVerified(bob, bob.id, true)).rejects.toThrow(/permission/);
    await expect(decideAvatar(bob, bob.id, true)).rejects.toThrow(/permission/);
    // Pretending to be admin by setting a flag on a non-admin row is impossible: isAdmin comes from ADMIN_EMAIL.
    const [row] = await db.select().from(users).where(eq(users.id, bob.id));
    expect(row.email).not.toBe(process.env.ADMIN_EMAIL);
  });

  it("the admin account cannot be banned, suspended, signed out or deleted", async () => {
    await expect(banUser(admin, admin.id, "x")).rejects.toThrow(/admin account/);
    await expect(suspendUser(admin, admin.id, 3, "x")).rejects.toThrow(/admin account/);
    await expect(forceSignOut(admin, admin.id)).rejects.toThrow(/admin account/);
    await expect(adminDeleteUser(admin, admin.id, "delete_posts", "x")).rejects.toThrow(/admin account/);
  });

  it("sensitive admin actions require a recent password", async () => {
    const stale = { ...admin, reauthAt: new Date(Date.now() - 60 * 60_000) };
    await expect(banUser(stale, bob.id, "x")).rejects.toThrow(/confirm your password/);
    await expect(fullBackup(stale)).rejects.toThrow(/confirm your password/);
  });

  it("posters may edit the title only, and only their own", async () => {
    const { id } = await newStudyPost(alice, "Original title here");
    await expect(editPostTitle(bob, id, "Hijacked title")).rejects.toThrow(/own posts/);
    await expect(editPostTitle(alice, id, "Bad")).rejects.toThrow(/at least 5/);
    await expect(editPostTitle(alice, id, "What the fuck notes")).rejects.toThrow(/inappropriate/);
    await editPostTitle(alice, id, "Better title for notes");
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.title).toBe("Better title for notes");
    expect(p.titleEdited).toBe(true);
    expect(p.description).toBe("My own summary of week 3.");
    const history = await db.select().from(postTitleHistory).where(eq(postTitleHistory.postId, id));
    expect(history[0]).toMatchObject({ oldTitle: "Original title here", newTitle: "Better title for notes" });
    // The DAL exposes no function that changes description, tags, semester or files after submission.
    const dal = await import("@/server/dal/posts");
    expect(Object.keys(dal).filter((k) => /^(edit|update)/i.test(k))).toEqual(["editPostTitle"]);
    // Admin can revert.
    await revertTitle(admin, history[0].id);
    const [reverted] = await db.select().from(posts).where(eq(posts.id, id));
    expect(reverted.title).toBe("Original title here");
  });

  it("re-approval after title edit is enforced when the admin turns it on", async () => {
    const { id } = await newStudyPost(alice, "Will be re-approved");
    await decidePost(admin, id, { decision: "approve" });
    await saveSettings({ requireReapprovalAfterTitleEdit: true });
    clearSettingsCache();
    await editPostTitle(alice, id, "Changed after approval");
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.status).toBe("pending");
    await saveSettings({ requireReapprovalAfterTitleEdit: false });
  });

  it("delete: poster can delete own; others cannot; admin must give a reason", async () => {
    const a = await newStudyPost(alice, "Alice will delete this");
    await expect(deletePost(bob, a.id)).rejects.toThrow(/permission/);
    await deletePost(alice, a.id);
    await expect(getPostDetail(alice, a.id)).rejects.toThrow(/could not find/);
    expect((await getPostDetail(admin, a.id)).deletedAt).not.toBeNull();

    const b = await newStudyPost(alice, "Admin will delete this");
    await expect(deletePost(admin, b.id)).rejects.toThrow(/reason/);
    await deletePost(admin, b.id, "Contains exam answers");
    const [row] = await db.select().from(posts).where(eq(posts.id, b.id));
    expect(row.deletedAt).not.toBeNull();
    expect(row.deleteReason).toBe("Contains exam answers");
  });

  it("admin posts are auto-approved", async () => {
    const { status } = await newStudyPost(admin, "Welcome to Sunway Hub");
    expect(status).toBe("approved");
  });

  it("club posts require being that club's manager", async () => {
    await importSunwayClubs(admin);
    await importSunwayClubs(admin); // idempotent
    const all = await db.select().from(clubs);
    expect(all.length).toBe(SUNWAY_CLUBS.length);
    const club = all[0];
    await expect(
      createPost(bob, { type: "club", title: "Club recruitment", clubId: club.id, ownWork: true }),
    ).rejects.toThrow(/managers/);
    await expect(updateClubAsManager(bob, club.id, { description: "Hacked" })).rejects.toThrow(/managers/);
    await assignClubManager(admin, club.id, bob.id, true);
    const bobManager = { ...bob, managedClubIds: [club.id] };
    const r = await createPost(bobManager, { type: "club", title: "Club recruitment", clubId: club.id, ownWork: true });
    expect(r.status).toBe("pending"); // still needs approval
    await updateClubAsManager(bobManager, club.id, { description: "We meet on Fridays.", socials: { instagram: "@ourclub" } });
    await expect(updateClubAsManager(bobManager, club.id, { description: "shit club" })).rejects.toThrow(/inappropriate/);
  });

  it("helpful: one vote per member, not on own posts, only on approved posts", async () => {
    const { id } = await newStudyPost(alice, "Helpful candidate post");
    await expect(toggleHelpful(bob, id)).rejects.toThrow(/could not find/);
    await decidePost(admin, id, { decision: "approve" });
    await expect(toggleHelpful(alice, id)).rejects.toThrow(/own post/);
    expect(await toggleHelpful(bob, id)).toBe(true);
    expect((await getPostDetail(alice, id)).helpfulCount).toBe(1);
    expect(await toggleHelpful(bob, id)).toBe(false);
    expect((await getPostDetail(alice, id)).helpfulCount).toBe(0);
  });

  it("3 reports from different members hide content automatically", async () => {
    const { id } = await newStudyPost(alice, "Reported post title");
    await decidePost(admin, id, { decision: "approve" });
    const carol = await makeUser();
    const dave = await makeUser();
    await createReport(bob, { targetType: "post", targetId: id, reason: "spam" });
    await expect(createReport(bob, { targetType: "post", targetId: id, reason: "spam" })).rejects.toThrow(/already reported/);
    await createReport(carol, { targetType: "post", targetId: id, reason: "copyright" });
    expect((await getPostDetail(bob, id)).hiddenByReports).toBe(false);
    await createReport(dave, { targetType: "post", targetId: id, reason: "inappropriate", note: "Looks like an exam paper" });
    await expect(getPostDetail(bob, id)).rejects.toThrow(/could not find/);
    expect((await getPostDetail(alice, id)).hiddenByReports).toBe(true);
  });

  it("only the admin can give out two-character usernames", async () => {
    const carol = await makeUser();
    const profile = { displayName: "Carol", roleLabel: "student" as const, pronouns: "unspecified" as const, bio: "" };
    await expect(updateProfile(carol, { ...profile, username: "cz" })).rejects.toThrow(/admin/);
    await expect(setUsername(carol, carol.id, "cz")).rejects.toThrow();
    await setUsername(admin, carol.id, "cz");
    const [row] = await db.select().from(users).where(eq(users.id, carol.id));
    expect(row.username).toBe("cz");
    // Carol keeps it when saving her other settings.
    await updateProfile({ ...carol, username: "cz" }, { ...profile, username: "cz", bio: "Hi" });
    await expect(setUsername(admin, bob.id, "cz")).rejects.toThrow(/taken/);
  });

  it("profile: email hidden by default, teacher badge only after verification", async () => {
    await db.update(users).set({ roleLabel: "teacher" }).where(eq(users.id, alice.id));
    const asBob = await getProfile(bob, alice.username!);
    expect(asBob.email).toBeNull();
    expect(asBob.teacherBadge).toBeNull();
    const asAlice = await getProfile(alice, alice.username!);
    expect(asAlice.email).toBe(alice.email);
    expect(asAlice.teacherBadge).toBe("pending");
    await setTeacherVerified(admin, alice.id, true);
    expect((await getProfile(bob, alice.username!)).teacherBadge).toBe("verified");
    await db.update(users).set({ emailPublic: true }).where(eq(users.id, alice.id));
    expect((await getProfile(bob, alice.username!)).email).toBe(alice.email);
  });

  it("profile pictures stay private until approved", async () => {
    expect(await uploadAvatar(alice, await pngBytes(600, 600), "me.png")).toBe("pending");
    expect(await getAvatarFileForViewer(bob, alice.id, true)).toBeNull();
    expect(await getAvatarFileForViewer(bob, alice.id, false)).toBeNull();
    expect(await getAvatarFileForViewer(alice, alice.id, true)).not.toBeNull();
    await decideAvatar(admin, alice.id, true);
    expect(await getAvatarFileForViewer(bob, alice.id, false)).not.toBeNull();
    // A new picture keeps the approved one visible meanwhile; rejection keeps it too.
    await uploadAvatar(alice, await pngBytes(300, 300), "new.png");
    const approvedBefore = await getAvatarFileForViewer(bob, alice.id, false);
    await expect(decideAvatar(admin, alice.id, false)).rejects.toThrow(/reason/);
    await decideAvatar(admin, alice.id, false, "Please use a photo of yourself");
    expect((await getAvatarFileForViewer(bob, alice.id, false))?.id).toBe(approvedBefore?.id);
  });
});
