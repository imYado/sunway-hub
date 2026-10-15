import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { readSessionToken } from "./auth/cookies";
import { actorFromSession, loadSession, type LoadedSession } from "./auth/session";
import type { Actor } from "./actor-types";
import { ForbiddenError } from "./errors";
import { needsConsent } from "./legal";

export type { Actor };

/** The current session (any stage), memoised per request. */
export const getSession = cache(async (): Promise<LoadedSession | null> => {
  return loadSession(await readSessionToken());
});

/** The signed-in actor with a fully active session, or null. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const s = await getSession();
  if (!s || s.stage !== "active") return null;
  return actorFromSession(s);
});

export const GUEST_COOKIE = "sh_guest";
export const GUEST_ONLY_MESSAGE = "Guests can only look around. Sign in to do this.";

/**
 * Stands in for a guest on read-only pages. Its id matches no row, so it owns
 * nothing, has voted on nothing and belongs to nothing. Every write goes
 * through actorForAction(), which never returns it.
 */
export const GUEST_ACTOR: Actor = Object.freeze({
  id: "00000000-0000-0000-0000-000000000000",
  email: "",
  username: null,
  displayName: null,
  isAdmin: false,
  onboarded: true,
  sessionId: "",
  reauthAt: null,
  managedClubIds: [],
  guest: true,
}) as Actor;

export async function isGuest(): Promise<boolean> {
  return (await cookies()).get(GUEST_COOKIE)?.value === "1";
}

/** A signed-in member, or the guest stand-in, or null. For read-only routes. */
export async function getViewer(): Promise<Actor | null> {
  const actor = await getActor();
  if (actor) return actor;
  return (await isGuest()) ? GUEST_ACTOR : null;
}

/**
 * For pages: requires an active, onboarded member who has accepted the current legal documents.
 * With guestOk, a guest may view the page too (as GUEST_ACTOR).
 */
export async function requireMember(opts: { guestOk?: boolean } = {}): Promise<Actor> {
  const actor = await getActor();
  if (!actor && opts.guestOk && (await isGuest())) return GUEST_ACTOR;
  if (!actor) redirect("/login");
  if (!actor.onboarded || (await needsConsent(actor.id))) redirect("/onboarding");
  return actor;
}

/** For pages: admin only. Everyone else gets a 404 so the admin area stays hidden. */
export async function requireAdminPage(): Promise<Actor> {
  const actor = await getActor();
  if (!actor || !actor.isAdmin) notFound();
  return actor;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function actorForAction(opts: { allowNotOnboarded?: boolean } = {}): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new ForbiddenError((await isGuest()) ? GUEST_ONLY_MESSAGE : "Please sign in again.");
  if (!opts.allowNotOnboarded && !actor.onboarded) throw new ForbiddenError("Please finish setting up your account first.");
  return actor;
}
