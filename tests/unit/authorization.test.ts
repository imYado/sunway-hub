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
  votePost,
} from "@/server/dal/posts";
import { createReport } from "@/server/dal/reports";
import { getAvatarFileForViewer, getProfile, updateProfile, uploadAvatar } from "@/server/dal/users";
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

  it("new posts are live straight away and wait in the admin's review queue", async () => {
    const live = await newStudyPost(alice, "Live straight away");
    expect(live.status).toBe("approved");
    expect((await getPostDetail(bob, live.id)).title).toBe("Live straight away");
    expect((await pendingPosts(admin)).map((p) => p.id)).toContain(live.id);
    await decidePost(admin, live.id, { decision: "approve" });
    expect((await pendingPosts(admin)).map((p) => p.id)).not.toContain(live.id);
  });

  it("members cannot see other people's posts that are waiting for approval", async () => {
    const { id } = await newStudyPost(alice);
    await db.update(posts).set({ status: "pending", decidedAt: null }).where(eq(posts.id, id));
    await expect(getPostDetail(bob, id)).rejects.toThrow(/could not find/);
    expect((await getPostDetail(alice, id)).status).toBe("pending");
    expect((await getPostDetail(admin, id)).status).toBe("pending");
    expect((await searchPosts(bob, {})).items.find((p) => p.id === id)).toBeUndefined();
    await expect(listProfilePosts(bob, alice.id, "pending")).rejects.toThrow(/permission/);
    expect((await listProfilePosts(alice, alice.id, "pending")).map((p) => p.id)).toContain(id);
  });

  it("files of pending posts are only served to the owner and admin", async () => {
    const { id } = await newStudyPost(alice, "Pending post with a file", true);
    await db.update(posts).set({ status: "pending", decidedAt: null }).where(eq(posts.id, id));
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
      createPost(bob, { type: "study", title: "Stolen upload", subjects: ["X"], files: [stolen] }),
    ).rejects.toThrow(/Invalid upload/);
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

  it("posters may edit their own posts; title edits are kept in the history", async () => {
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
    // Admin can revert.
    await revertTitle(admin, history[0].id);
    const [reverted] = await db.select().from(posts).where(eq(posts.id, id));
    expect(reverted.title).toBe("Original title here");
  });

  it("an edited post stays live but goes back in the admin's review queue", async () => {
    const { id } = await newStudyPost(alice, "Will be reviewed again");
    await decidePost(admin, id, { decision: "approve" });
    await editPostTitle(alice, id, "Changed after review");
    const [p] = await db.select().from(posts).where(eq(posts.id, id));
    expect(p.status).toBe("approved");
    expect((await pendingPosts(admin)).map((x) => x.id)).toContain(id);
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
    const { status } = await newStudyPost(admin, "Welcome to SJ Study");
    expect(status).toBe("approved");
  });

  it("club posts require being that club's manager", async () => {
    await importSunwayClubs(admin);
    await importSunwayClubs(admin); // idempotent
    const all = await db.select().from(clubs);
    expect(all.length).toBe(SUNWAY_CLUBS.length);
    const club = all[0];
    await expect(
      createPost(bob, { type: "club", title: "Club recruitment", clubId: club.id }),
    ).rejects.toThrow(/managers/);
    await expect(updateClubAsManager(bob, club.id, { description: "Hacked" })).rejects.toThrow(/managers/);
    await assignClubManager(admin, club.id, bob.id, true);
    const bobManager = { ...bob, managedClubIds: [club.id] };
    const r = await createPost(bobManager, { type: "club", title: "Club recruitment", clubId: club.id });
    expect(r.status).toBe("approved"); // live straight away, reviewed by the admin after
    await updateClubAsManager(bobManager, club.id, { description: "We meet on Fridays.", socials: { instagram: "@ourclub" } });
    await expect(updateClubAsManager(bobManager, club.id, { description: "shit club" })).rejects.toThrow(/inappropriate/);
  });

  it("votes: one per member, up or down, not on own posts, only on approved posts", async () => {
    const { id } = await newStudyPost(alice, "Vote candidate post");
    await decidePost(admin, id, { decision: "reject", reason: "Not yet" });
    await expect(votePost(bob, id, 1)).rejects.toThrow(/could not find/);
    await decidePost(admin, id, { decision: "approve" });
    await expect(votePost(alice, id, 1)).rejects.toThrow(/own post/);
    expect(await votePost(bob, id, 1)).toBe(1);
    expect(await votePost(bob, id, 1)).toBe(1);
    expect((await getPostDetail(alice, id)).score).toBe(1);
    expect(await votePost(admin, id, -1)).toBe(0);
    expect(await votePost(bob, id, -1)).toBe(-2);
    expect((await getPostDetail(bob, id)).viewerVote).toBe(-1);
    expect(await votePost(bob, id, 0)).toBe(-1);
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
    await expect(updateProfile(carol, { ...profile, username: "cz" })).rejects.toThrow("Not allowed.");
    await expect(setUsername(carol, carol.id, "cz")).rejects.toThrow();
    await setUsername(admin, carol.id, "cz");
    const [row] = await db.select().from(users).where(eq(users.id, carol.id));
    expect(row.username).toBe("cz");
    // Carol keeps it when saving her other settings.
    await updateProfile({ ...carol, username: "cz" }, { ...profile, username: "cz", bio: "Hi" });
    await expect(setUsername(admin, bob.id, "cz")).rejects.toThrow(/taken/);
  });

  it("members can change their username twice a week; the admin has no limit", async () => {
    const dave = await makeUser();
    const profile = { displayName: "Dave", roleLabel: "student" as const, pronouns: "unspecified" as const, bio: "" };
    const me = async () => (await db.select().from(users).where(eq(users.id, dave.id)))[0];
    await updateProfile(dave, { ...profile, username: "dave_one" });
    await updateProfile(dave, { ...profile, username: "dave_two" });
    await expect(updateProfile(dave, { ...profile, username: "dave_three" })).rejects.toThrow(/2 times a week/);
    // A week after the first of the two changes, one more is allowed.
    await db.update(users).set({ usernamePrevChangedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(users.id, dave.id));
    await updateProfile(dave, { ...profile, username: "dave_three" });
    expect((await me()).username).toBe("dave_three");

    const adminProfile = { ...profile, displayName: "Admin" };
    for (const name of ["boss_a", "boss_b", "boss_c", "mq"]) await updateProfile(admin, { ...adminProfile, username: name });
    await setUsername(admin, dave.id, "dave_four");
    await setUsername(admin, dave.id, "dave_five");
    expect((await me()).username).toBe("dave_five");
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
