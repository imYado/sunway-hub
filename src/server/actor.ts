import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
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

/** For pages: requires an active, onboarded member who has accepted the current legal documents. */
export async function requireMember(): Promise<Actor> {
  const actor = await getActor();
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
  if (!actor) throw new ForbiddenError("Please sign in again.");
  if (!opts.allowNotOnboarded && !actor.onboarded) throw new ForbiddenError("Please finish setting up your account first.");
  return actor;
}
