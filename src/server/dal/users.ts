import "server-only";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import {
  bookmarks,
  clubFollows,
  clubManagerRequests,
  clubManagers,
  eventRsvps,
  helpfulVotes,
  notificationSettings,
  notifications,
  posts,
  reports,
  sessions,
  storedFiles,
  subjectFollows,
  userAvatars,
  userConsents,
  users,
} from "@/db/schema";
import { BIO_MAX, DISPLAY_NAME_MAX, USERNAME_CHANGES_PER_WEEK, nextUsernameChange, usernameProblem } from "@/lib/rules";
import type { Actor } from "../actor-types";
import { audit } from "../audit";
import { verifyOtp, issueOtp } from "../auth/otp";
import { AppError, ForbiddenError, NotFoundError } from "../errors";
import { assertClean } from "../profanity";
import { enforce, LIMITS } from "../rate-limit";
import { recordConsent } from "../legal";
import { storage } from "../storage";
import { processSquareImage, storageStatus } from "./uploads";
import { PURGE_AFTER_DAYS } from "./posts";

export type UserRow = typeof users.$inferSelect;

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter your name.").max(DISPLAY_NAME_MAX),
  username: z.string().trim().toLowerCase(),
  roleLabel: z.enum(["student", "teacher", "other"]),
  pronouns: z.enum(["he", "she", "unspecified"]),
  bio: z.string().trim().max(BIO_MAX, `Bios can be at most ${BIO_MAX} characters.`).default(""),
});

export async function assertUsernameAvailable(username: string, selfId: string, opts: { allowShort?: boolean } = {}) {
  const problem = usernameProblem(username, opts);
  if (problem) throw new AppError(problem);
  await assertClean(username.replace(/_/g, " "), username);
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), ne(users.id, selfId)))
    .limit(1);
  if (taken) throw new AppError("That username is taken. Please choose another.");
}

/** One-time onboarding: consent + profile basics. */
export async function completeOnboarding(
  actor: Actor,
  input: z.input<typeof profileSchema> & { acceptTerms: boolean },
): Promise<void> {
  if (!input.acceptTerms) throw new AppError("Please accept the Terms and Privacy Policy to continue.");
  const [me] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!me) throw new NotFoundError();
  if (me.onboardedAt) {
    // Already onboarded: this is a re-acceptance of updated legal documents.
    await recordConsent(actor.id);
    return;
  }
  const p = profileSchema.parse(input);
  await assertUsernameAvailable(p.username, actor.id);
  await assertClean(p.displayName, p.bio);
  await db
    .update(users)
    .set({
      displayName: p.displayName,
      username: p.username,
      roleLabel: p.roleLabel,
      pronouns: p.pronouns,
      bio: p.bio || null,
      onboardedAt: new Date(),
    })
    .where(eq(users.id, actor.id));
  await recordConsent(actor.id);
}

export async function reacceptLegal(actor: Actor, accept: boolean) {
  if (!accept) throw new AppError("Please accept the updated Terms and Privacy Policy to continue.");
  await recordConsent(actor.id);
}

export async function updateProfile(actor: Actor, raw: z.input<typeof profileSchema>): Promise<void> {
  const p = profileSchema.parse(raw);
  const [me] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!me) throw new NotFoundError();
  await enforce("write", actor.id, LIMITS.writePerUser.limit, LIMITS.writePerUser.window);
  const usernameChanged = p.username !== me.username;
  if (usernameChanged) {
    if (!actor.isAdmin && nextUsernameChange(me.usernamePrevChangedAt)) {
      throw new AppError(`You can change your username ${USERNAME_CHANGES_PER_WEEK} times a week.`);
    }
    await assertUsernameAvailable(p.username, actor.id, { allowShort: actor.isAdmin });
  }
  await assertClean(p.displayName, p.bio);
  const becameTeacher = p.roleLabel === "teacher" && me.roleLabel !== "teacher";
  await db
    .update(users)
    .set({
      displayName: p.displayName,
      username: p.username,
      roleLabel: p.roleLabel,
      pronouns: p.pronouns,
      bio: p.bio || null,
      // Changing role away from teacher removes the badge; becoming a teacher again needs re-verification.
      teacherVerified: p.roleLabel === "teacher" && !becameTeacher ? me.teacherVerified : false,
      ...(usernameChanged ? { usernameChangedAt: new Date(), usernamePrevChangedAt: me.usernameChangedAt } : {}),
    })
    .where(eq(users.id, actor.id));
}

export async function setEmailVisibility(actor: Actor, visible: boolean) {
  await db.update(users).set({ emailPublic: visible }).where(eq(users.id, actor.id));
}

// ---------------------------------------------------------------------------
// Profile view
// ---------------------------------------------------------------------------
export interface ProfileView {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  pronouns: "he" | "she" | null;
  role: "student" | "teacher" | "other";
  teacherBadge: "verified" | "pending" | null;
  email: string | null;
  emailPublic: boolean;
  joinedAt: Date;
  avatar: { approvedFileId: string | null; pendingFileId: string | null; lastRejectionReason: string | null };
  isOwner: boolean;
  viewerIsAdmin: boolean;
  status: UserRow["status"];
  hiddenByReports: boolean;
}

export function buildProfileView(actor: Actor, u: UserRow, avatar: typeof userAvatars.$inferSelect | undefined): ProfileView {
  const isOwner = actor.id === u.id;
  const privileged = isOwner || actor.isAdmin;
  return {
    id: u.id,
    username: u.username ?? "",
    displayName: u.displayName ?? u.username ?? "Member",
    bio: u.bio,
    pronouns: u.pronouns === "unspecified" ? null : u.pronouns,
    role: u.roleLabel,
    // Public sees "Verified teacher" only after admin verification; owner/admin also see "pending".
    teacherBadge: u.roleLabel === "teacher" ? (u.teacherVerified ? "verified" : privileged ? "pending" : null) : null,
    email: privileged || u.emailPublic ? u.email : null,
    emailPublic: u.emailPublic,
    joinedAt: u.createdAt,
    avatar: {
      approvedFileId: avatar?.approvedFileId ?? null,
      pendingFileId: privileged ? (avatar?.pendingFileId ?? null) : null,
      lastRejectionReason: privileged ? (avatar?.lastRejectionReason ?? null) : null,
    },
    isOwner,
    viewerIsAdmin: actor.isAdmin,
    status: u.status,
    hiddenByReports: u.hiddenByReports,
  };
}

export async function getProfile(actor: Actor, username: string): Promise<ProfileView> {
  const [u] = await db.select().from(users).where(eq(users.username, username.toLowerCase())).limit(1);
  if (!u || u.status === "deleted" || !u.onboardedAt) throw new NotFoundError();
  const isOwner = actor.id === u.id;
  if (!isOwner && !actor.isAdmin && (u.status === "banned" || u.hiddenByReports)) throw new NotFoundError();
  const [avatar] = await db.select().from(userAvatars).where(eq(userAvatars.userId, u.id)).limit(1);
  return buildProfileView(actor, u, avatar);
}

export async function getMe(actor: Actor): Promise<UserRow> {
  const [u] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!u) throw new NotFoundError();
  return u;
}

// ---------------------------------------------------------------------------
// Avatars (admin approval required before the public sees them)
// ---------------------------------------------------------------------------
export async function uploadAvatar(actor: Actor, bytes: Buffer, originalName: string): Promise<"pending" | "approved"> {
  await enforce("write", actor.id, LIMITS.writePerUser.limit, LIMITS.writePerUser.window);
  const status = await storageStatus();
  if (status.refuse) throw new AppError("Uploads are paused because the site's shared storage is nearly full.", 503);
  const img = await processSquareImage(bytes);
  const fileId = randomUUID();
  const storagePath = `avatars/${actor.id}/${fileId}.webp`;
  await storage().put(storagePath, img.data, img.mime);
  const autoApprove = actor.isAdmin;
  const [current] = await db.select().from(userAvatars).where(eq(userAvatars.userId, actor.id)).limit(1);
  await db.insert(storedFiles).values({
    id: fileId,
    ownerId: actor.id,
    purpose: "avatar",
    storagePath,
    originalName: originalName.slice(0, 120) || "avatar",
    contentType: img.mime,
    kind: "image",
    size: img.data.length,
    sha256: img.sha256,
    width: 512,
    height: 512,
    reviewStatus: autoApprove ? "approved" : "pending",
    reviewedAt: autoApprove ? new Date() : null,
    reviewedBy: autoApprove ? actor.id : null,
  });
  // A replaced pending picture is discarded; the previous APPROVED picture stays visible meanwhile.
  const stalePending = current?.pendingFileId;
  if (autoApprove) {
    const staleApproved = current?.approvedFileId;
    await db
      .insert(userAvatars)
      .values({ userId: actor.id, approvedFileId: fileId, pendingFileId: null })
      .onConflictDoUpdate({ target: userAvatars.userId, set: { approvedFileId: fileId, pendingFileId: null } });
    if (staleApproved) await softDeleteFile(staleApproved);
  } else {
    await db
      .insert(userAvatars)
      .values({ userId: actor.id, pendingFileId: fileId })
      .onConflictDoUpdate({ target: userAvatars.userId, set: { pendingFileId: fileId, lastRejectionReason: null } });
  }
  if (stalePending) await softDeleteFile(stalePending);
  return autoApprove ? "approved" : "pending";
}

export async function removeAvatar(actor: Actor) {
  const [current] = await db.select().from(userAvatars).where(eq(userAvatars.userId, actor.id)).limit(1);
  if (!current) return;
  await db.update(userAvatars).set({ approvedFileId: null, pendingFileId: null }).where(eq(userAvatars.userId, actor.id));
  for (const id of [current.approvedFileId, current.pendingFileId]) if (id) await softDeleteFile(id);
}

export async function softDeleteFile(fileId: string) {
  await db.update(storedFiles).set({ deletedAt: new Date() }).where(and(eq(storedFiles.id, fileId), isNull(storedFiles.deletedAt)));
}

/** Who may see which avatar file: approved = any member; pending = owner and admin only. */
export async function getAvatarFileForViewer(actor: Actor, userId: string, wantPending: boolean) {
  const [a] = await db.select().from(userAvatars).where(eq(userAvatars.userId, userId)).limit(1);
  if (!a) return null;
  const privileged = actor.id === userId || actor.isAdmin;
  const fileId = wantPending && privileged ? a.pendingFileId : a.approvedFileId;
  if (!fileId) return null;
  const [f] = await db.select().from(storedFiles).where(eq(storedFiles.id, fileId)).limit(1);
  return f && !f.deletedAt ? f : null;
}

/** Admin preview of any avatar/logo file under review. */
export async function getReviewFileForAdmin(actor: Actor, fileId: string) {
  if (!actor.isAdmin) return null;
  const [f] = await db.select().from(storedFiles).where(eq(storedFiles.id, fileId)).limit(1);
  return f ?? null;
}

// ---------------------------------------------------------------------------
// Data export and account deletion
// ---------------------------------------------------------------------------
export async function exportMyData(actor: Actor) {
  const [me] = await db.select().from(users).where(eq(users.id, actor.id));
  const myPosts = await db.select().from(posts).where(eq(posts.authorId, actor.id));
  const postIds = myPosts.map((p) => p.id);
  return {
    exportedAt: new Date().toISOString(),
    profile: me,
    consents: await db.select().from(userConsents).where(eq(userConsents.userId, actor.id)),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- drop the internal search column
    posts: myPosts.map(({ search: _s, ...p }) => p),
    files: postIds.length
      ? (await db.select().from(storedFiles).where(inArray(storedFiles.postId, postIds))).map((f) => ({
          id: f.id,
          postId: f.postId,
          name: f.originalName,
          type: f.contentType,
          size: f.size,
          createdAt: f.createdAt,
        }))
      : [],
    bookmarks: await db.select().from(bookmarks).where(eq(bookmarks.userId, actor.id)),
    helpfulVotes: await db.select().from(helpfulVotes).where(eq(helpfulVotes.userId, actor.id)),
    rsvps: await db.select().from(eventRsvps).where(eq(eventRsvps.userId, actor.id)),
    clubFollows: await db.select().from(clubFollows).where(eq(clubFollows.userId, actor.id)),
    subjectFollows: await db.select().from(subjectFollows).where(eq(subjectFollows.userId, actor.id)),
    clubManagerRequests: await db.select().from(clubManagerRequests).where(eq(clubManagerRequests.userId, actor.id)),
    reportsSubmitted: await db.select().from(reports).where(eq(reports.reporterId, actor.id)),
    notifications: await db.select().from(notifications).where(eq(notifications.userId, actor.id)),
    notificationSettings: await db.select().from(notificationSettings).where(eq(notificationSettings.userId, actor.id)),
    sessions: (await db.select().from(sessions).where(eq(sessions.userId, actor.id))).map((s) => ({
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      userAgent: s.userAgent,
    })),
  };
}

export async function requestAccountDeletionCode(actor: Actor) {
  if (actor.isAdmin) throw new ForbiddenError("The admin account cannot be deleted. See HANDOVER.md to transfer ownership.");
  await enforce("code-email", actor.email, LIMITS.codeRequestPerEmail.limit, LIMITS.codeRequestPerEmail.window);
  await issueOtp(actor.email, "delete_account");
}

/**
 * Deletes an account. Personal data is erased right away. Posts are either
 * soft-deleted (purged after 30 days) or kept and shown as "Deleted user".
 */
export async function eraseUser(userId: string, mode: "delete_posts" | "anonymise_posts", by: Actor | null, reason?: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new NotFoundError();
  const now = new Date();
  const purgeNote = mode === "delete_posts" ? "Account deleted" : null;
  await db.transaction(async (tx) => {
    if (mode === "delete_posts") {
      await tx
        .update(posts)
        .set({ deletedAt: now, deletedBy: by?.id ?? userId, deleteReason: purgeNote })
        .where(and(eq(posts.authorId, userId), isNull(posts.deletedAt)));
    }
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(bookmarks).where(eq(bookmarks.userId, userId));
    await tx.delete(clubFollows).where(eq(clubFollows.userId, userId));
    await tx.delete(subjectFollows).where(eq(subjectFollows.userId, userId));
    await tx.delete(clubManagers).where(eq(clubManagers.userId, userId));
    await tx.delete(clubManagerRequests).where(eq(clubManagerRequests.userId, userId));
    await tx.delete(eventRsvps).where(eq(eventRsvps.userId, userId));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx
      .update(storedFiles)
      .set({ deletedAt: now })
      .where(and(eq(storedFiles.ownerId, userId), inArray(storedFiles.purpose, ["avatar"]), isNull(storedFiles.deletedAt)));
    await tx.delete(userAvatars).where(eq(userAvatars.userId, userId));
    // Free the email so the person could sign up again later; drop all profile fields.
    await tx
      .update(users)
      .set({
        email: `deleted-${userId}@deleted.invalid`,
        username: null,
        displayName: null,
        bio: null,
        pronouns: "unspecified",
        emailPublic: false,
        teacherVerified: false,
        status: "deleted",
        deletedAt: now,
      })
      .where(eq(users.id, userId));
  });
  await audit(by, by && by.id !== userId ? "user.delete_by_admin" : "user.delete_self", { type: "user", id: userId }, reason ?? null, {
    mode,
    purgeAfterDays: PURGE_AFTER_DAYS,
  });
}

export async function deleteMyAccount(actor: Actor, code: string, mode: "delete_posts" | "anonymise_posts") {
  if (actor.isAdmin) throw new ForbiddenError("The admin account cannot be deleted.");
  const ok = await verifyOtp(actor.email, "delete_account", code.trim());
  if (!ok) throw new AppError("That code is incorrect or has expired.");
  await eraseUser(actor.id, mode, actor);
}
