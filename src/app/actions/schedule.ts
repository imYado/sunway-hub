"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actorForAction } from "@/server/actor";
import { bool, runAction, str, type ActionState } from "@/server/action-utils";
import { AppError } from "@/server/errors";
import { setLeaderboardOptIn } from "@/server/dal/leaderboard";
import {
  createGroup,
  createPlan,
  deleteGroup,
  deletePlan,
  joinGroup,
  leaveGroup,
  removeMember,
  resetInvite,
  togglePlanGoing,
  updateGroup,
} from "@/server/dal/groups";
import { addTimetableSlot, clearTimetable, importTimetable, removeTimetableSlot, saveCalendarPrefs } from "@/server/dal/schedule";

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------
function refreshSchedule() {
  revalidatePath("/schedule", "layout");
  revalidatePath("/study-groups", "layout");
}

export async function addSlotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await addTimetableSlot(actor, { day: Number(str(fd, "day")), start: str(fd, "start"), end: str(fd, "end"), label: str(fd, "label"), location: str(fd, "location") });
    refreshSchedule();
    return "Added.";
  });
}

export async function removeSlotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await removeTimetableSlot(actor, str(fd, "id"));
    refreshSchedule();
  });
}

export async function clearTimetableAction(): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await clearTimetable(actor);
    refreshSchedule();
    return "Your timetable is empty now.";
  });
}

export async function importTimetableAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("Choose a calendar file first.");
    const n = await importTimetable(actor, Buffer.from(await file.arrayBuffer()), bool(fd, "replace"));
    refreshSchedule();
    return `Added ${n} weekly ${n === 1 ? "slot" : "slots"}. Check them below and remove anything that isn't a class.`;
  });
}

export async function saveEventFiltersAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const clubs = str(fd, "clubs");
    const { unknown } = await saveCalendarPrefs(actor, {
      clubs: clubs === "none" || clubs === "all" || clubs === "chosen" ? clubs : "following",
      clubIds: fd.getAll("clubId").filter((v): v is string => typeof v === "string"),
      usernames: str(fd, "people")
        .split(/[\s,]+/)
        .filter(Boolean),
      roles: fd.getAll("role").filter((v): v is "teacher" | "student" | "other" => v === "teacher" || v === "student" || v === "other"),
    });
    refreshSchedule();
    if (unknown.length) return { ok: true, message: `Saved. We couldn't find ${unknown.map((u) => `@${u}`).join(", ")}, so they were left out.` };
    return "Saved.";
  });
}

// ---------------------------------------------------------------------------
// Study groups
// ---------------------------------------------------------------------------
export async function createGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const result = await runAction(async () => {
    const actor = await actorForAction();
    id = await createGroup(actor, { name: str(fd, "name"), description: str(fd, "description") });
  });
  if (result?.ok) redirect(`/study-groups/${id}`);
  return result;
}

export async function updateGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "groupId");
    await updateGroup(actor, id, { name: str(fd, "name"), description: str(fd, "description") });
    revalidatePath(`/study-groups/${id}`);
    return "Saved.";
  });
}

export async function joinGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const result = await runAction(async () => {
    const actor = await actorForAction();
    id = await joinGroup(actor, str(fd, "code"));
  });
  if (result?.ok) {
    revalidatePath("/study-groups");
    redirect(`/study-groups/${id}`);
  }
  return result;
}

export async function leaveGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const actor = await actorForAction();
    await leaveGroup(actor, str(fd, "groupId"));
  });
  if (result?.ok) {
    revalidatePath("/study-groups");
    redirect("/study-groups");
  }
  return result;
}

export async function removeMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "groupId");
    await removeMember(actor, id, str(fd, "userId"));
    revalidatePath(`/study-groups/${id}`);
  });
}

export async function resetInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "groupId");
    await resetInvite(actor, id);
    revalidatePath(`/study-groups/${id}`);
    return "New invite link made. The old one no longer works.";
  });
}

export async function deleteGroupAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const result = await runAction(async () => {
    const actor = await actorForAction();
    await deleteGroup(actor, str(fd, "groupId"), str(fd, "reason") || undefined);
  });
  if (result?.ok) {
    revalidatePath("/study-groups");
    redirect("/study-groups");
  }
  return result;
}

export async function createPlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    const id = str(fd, "groupId");
    const kind = str(fd, "kind");
    await createPlan(actor, id, {
      title: str(fd, "title"),
      kind: kind === "outing" || kind === "other" ? kind : "study",
      date: str(fd, "date"),
      start: str(fd, "start"),
      end: str(fd, "end"),
      location: str(fd, "location"),
      notes: str(fd, "notes"),
    });
    refreshSchedule();
    return { ok: true, message: "Plan added. The others have been told." };
  });
}

export async function togglePlanGoingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await togglePlanGoing(actor, str(fd, "planId"));
    refreshSchedule();
  });
}

export async function deletePlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await deletePlan(actor, str(fd, "planId"));
    refreshSchedule();
  });
}

export async function leaderboardOptInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await actorForAction();
    await setLeaderboardOptIn(actor, bool(fd, "show"));
    revalidatePath("/settings");
    revalidatePath("/leaderboard");
    return "Saved.";
  });
}
