// Pure authorisation rules. Every DAL function goes through these, and they are
// unit-tested directly. Never rely on hidden buttons: the server re-checks all of this.
import type { Actor } from "../actor-types";
import { ForbiddenError, NotFoundError } from "../errors";

export interface PostLike {
  authorId: string;
  status: "pending" | "approved" | "rejected" | "changes_requested";
  hiddenByReports: boolean;
  deletedAt: Date | null;
  clubId?: string | null;
}

export function assertAdmin(actor: Actor | null | undefined): asserts actor is Actor {
  if (!actor || !actor.isAdmin) throw new ForbiddenError();
}

export function isPubliclyVisible(post: PostLike): boolean {
  return post.status === "approved" && !post.hiddenByReports && !post.deletedAt;
}

export function canViewPost(actor: Actor, post: PostLike): boolean {
  if (actor.isAdmin) return true;
  if (post.deletedAt) return false;
  if (post.authorId === actor.id) return true;
  return isPubliclyVisible(post);
}

export function assertCanViewPost(actor: Actor, post: PostLike | null | undefined): asserts post is PostLike {
  if (!post || !canViewPost(actor, post)) throw new NotFoundError();
}

/**
 * Only the poster may edit their post (title, text, tags, links and files). The admin
 * can hide or delete other people's posts but never change what they wrote.
 */
export function canEditPost(actor: Actor, post: PostLike): boolean {
  return !post.deletedAt && post.authorId === actor.id;
}

export function canDeletePost(actor: Actor, post: PostLike): boolean {
  if (post.deletedAt) return false;
  return actor.isAdmin || post.authorId === actor.id;
}

export function canInteract(actor: Actor, post: PostLike): boolean {
  return isPubliclyVisible(post) || (actor.isAdmin && !post.deletedAt);
}

export function managesClub(actor: Actor, clubId: string | null | undefined): boolean {
  if (!clubId) return false;
  return actor.isAdmin || actor.managedClubIds.includes(clubId);
}

export function assertManagesClub(actor: Actor, clubId: string) {
  if (!managesClub(actor, clubId)) throw new ForbiddenError("Only this club's managers can do that.");
}

/** A target cannot be the admin account for any moderation action. */
export function assertNotAdminTarget(targetEmail: string, adminEmail: string) {
  if (targetEmail.trim().toLowerCase() === adminEmail.trim().toLowerCase()) {
    throw new ForbiddenError("The admin account cannot be changed this way.");
  }
}
