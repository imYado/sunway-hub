"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { FileKind } from "@/lib/files";
import { actorForAction } from "@/server/actor";
import { bool, runAction, str, type ActionState } from "@/server/action-utils";
import { audit } from "@/server/audit";
import { changeAdminPassword, confirmAdminPassword, disableTotp, enableTotp } from "@/server/auth/login";
import { markReauthenticated, revokeOtherSessions } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { clientIp } from "@/server/request";
import {
  addWords,
  adminDeleteUser,
  banUser,
  bulkDecide,
  decideAvatar,
  decideLogo,
  decidePost,
  deleteStoredFile,
  forceSignOut,
  markMessageHandled,
  deleteContactMessage,
  reinstateUser,
  removeWord,
  requireRecentAuth,
  resolveReports,
  restorePost,
  revertTitle,
  setRoleLabel,
  setTeacherVerified,
  setSunwayVerified,
  setUsername,
  suspendUser,
  unhidePost,
  warnUser,
} from "@/server/dal/admin";
import {
  adminAddClub,
  adminDeleteClub,
  adminEditClub,
  adminImportClubsCsv,
  adminRestoreClub,
  assignClubManager,
  decideManagerRequest,
  importSunwayClubs,
} from "@/server/dal/clubs";
import { publishLegal, type LegalType } from "@/server/legal";
import { assertAdmin } from "@/server/dal/policy";
import { saveSettings } from "@/server/settings";
import type { ReportTarget } from "@/server/dal/reports";
import type { Actor } from "@/server/actor-types";

async function admin(): Promise<Actor> {
  const actor = await actorForAction({ allowNotOnboarded: true });
  assertAdmin(actor);
  return actor;
}

// ---- Approval queue --------------------------------------------------------
export async function decidePostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await admin();
    const decision = str(fd, "decision") as "approve" | "reject" | "changes";
    await decidePost(a, str(fd, "postId"), { decision, reason: str(fd, "reason") });
    revalidatePath("/admin/queue");
    return decision === "approve" ? "Approved." : decision === "reject" ? "Rejected." : "Changes requested.";
  });
}

export async function bulkDecideAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await admin();
    const ids = fd.getAll("postIds").map(String).filter(Boolean);
    if (ids.length === 0) throw new AppError("Select at least one post.");
    const decision = str(fd, "decision") === "reject" ? "reject" : "approve";
    await bulkDecide(a, ids, decision, str(fd, "reason"));
    revalidatePath("/admin/queue");
    return `${ids.length} post${ids.length === 1 ? "" : "s"} ${decision === "approve" ? "approved" : "rejected"}.`;
  });
}

export async function decideAvatarAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await admin();
    await decideAvatar(a, str(fd, "userId"), str(fd, "decision") === "approve", str(fd, "reason"));
    revalidatePath("/admin/queue");
    return "Done.";
  });
}

export async function decideLogoAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await admin();
    await decideLogo(a, str(fd, "clubId"), str(fd, "decision") === "approve", str(fd, "reason"));
    revalidatePath("/admin/queue");
    return "Done.";
  });
}

// ---- Content ---------------------------------------------------------------
export async function restorePostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await restorePost(await admin(), str(fd, "postId"));
    revalidatePath("/admin/content");
    return "Restored.";
  });
}

export async function unhidePostAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await unhidePost(await admin(), str(fd, "postId"));
    revalidatePath("/admin/content");
    return "Post is visible again.";
  });
}

export async function revertTitleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await revertTitle(await admin(), str(fd, "historyId"));
    revalidatePath(`/posts/${str(fd, "postId")}`);
    return "Title reverted.";
  });
}

export async function deleteFileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await deleteStoredFile(await admin(), str(fd, "fileId"), str(fd, "reason"));
    revalidatePath("/admin/content");
    return "File removed.";
  });
}

// ---- Users -----------------------------------------------------------------
export async function userAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await admin();
    const userId = str(fd, "userId");
    const reason = str(fd, "reason");
    switch (str(fd, "op")) {
      case "verify_sunway":
        await setSunwayVerified(a, userId);
        break;
      case "verify_teacher":
        await setTeacherVerified(a, userId, true);
        break;
      case "unverify_teacher":
        await setTeacherVerified(a, userId, false);
        break;
      case "username":
        await setUsername(a, userId, str(fd, "username"));
        break;
      case "role":
        await setRoleLabel(a, userId, str(fd, "role") as "student" | "teacher" | "other");
        break;
      case "suspend":
        await suspendUser(a, userId, Number(str(fd, "days")) || 7, reason);
        break;
      case "ban":
        await banUser(a, userId, reason);
        break;
      case "reinstate":
        await reinstateUser(a, userId);
        break;
      case "sign_out":
        await forceSignOut(a, userId);
        break;
      case "warn":
        await warnUser(a, userId, reason);
        break;
      case "assign_club":
        await assignClubManager(a, str(fd, "clubId"), userId, true);
        break;
      case "remove_club":
        await assignClubManager(a, str(fd, "clubId"), userId, false);
        break;
      case "delete":
        await adminDeleteUser(a, userId, str(fd, "mode") === "delete_posts" ? "delete_posts" : "anonymise_posts", reason);
        revalidatePath("/admin/users");
        return "Account deleted.";
      default:
        throw new AppError("Unknown action.");
    }
    revalidatePath(`/admin/users/${userId}`);
    return "Saved.";
  });
}

// ---- Clubs -----------------------------------------------------------------
export async function importClubsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return runAction(async () => {
    const r = await importSunwayClubs(await admin());
    revalidatePath("/admin/clubs");
    return `Imported ${r.inserted} new club${r.inserted === 1 ? "" : "s"}; ${r.updated} already existed.`;
  });
}

export async function addClubAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const slug = await adminAddClub(await admin(), {
      name: str(fd, "name"),
      category: str(fd, "category") as never,
      description: str(fd, "description"),
      instagram: str(fd, "instagram"),
    });
    revalidatePath("/admin/clubs");
    return `Club added: /clubs/${slug}`;
  });
}

export async function editClubAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await adminEditClub(await admin(), str(fd, "clubId"), {
      name: str(fd, "name"),
      category: str(fd, "category") as never,
      instagram: str(fd, "instagram"),
    });
    revalidatePath("/admin/clubs");
    return "Club saved.";
  });
}

export async function deleteClubAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await admin();
    if (str(fd, "op") === "restore") await adminRestoreClub(a, str(fd, "clubId"));
    else await adminDeleteClub(a, str(fd, "clubId"), str(fd, "reason"));
    revalidatePath("/admin/clubs");
    return "Done.";
  });
}

export async function csvImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await admin();
    const file = fd.get("csv");
    if (!(file instanceof File) || file.size === 0) throw new AppError("Choose a CSV file.");
    if (file.size > 1024 * 1024) throw new AppError("CSV files can be up to 1 MB.");
    const r = await adminImportClubsCsv(a, await file.text());
    revalidatePath("/admin/clubs");
    const errs = r.errors.length ? ` Problems: ${r.errors.slice(0, 5).join(" ")}${r.errors.length > 5 ? " ..." : ""}` : "";
    return { ok: r.errors.length === 0, message: `Imported ${r.inserted}, skipped ${r.skipped} existing.${errs}`, error: r.errors.length ? `Imported ${r.inserted}, skipped ${r.skipped}.${errs}` : undefined };
  });
}

export async function managerRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await decideManagerRequest(await admin(), str(fd, "requestId"), str(fd, "decision") === "approve", str(fd, "reason"));
    revalidatePath("/admin/clubs");
    return "Done.";
  });
}

// ---- Reports ---------------------------------------------------------------
export async function resolveReportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await resolveReports(
      await admin(),
      str(fd, "targetType") as ReportTarget,
      str(fd, "targetId"),
      str(fd, "op") as "dismiss" | "remove" | "warn" | "ban",
      str(fd, "note"),
    );
    revalidatePath("/admin/reports");
    return "Done.";
  });
}

// ---- Blocked words ---------------------------------------------------------
export async function addWordsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const list = str(fd, "list") === "allowed" ? "allowed" : "blocked";
    let text = str(fd, "words");
    const file = fd.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > 512 * 1024) throw new AppError("Word lists can be up to 512 KB.");
      text += `\n${await file.text()}`;
    }
    const n = await addWords(await admin(), list, text);
    revalidatePath("/admin/words");
    return `Added ${n} word${n === 1 ? "" : "s"}. Changes apply within 30 seconds.`;
  });
}

export async function removeWordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await removeWord(await admin(), str(fd, "list") === "allowed" ? "allowed" : "blocked", str(fd, "id"));
    revalidatePath("/admin/words");
  });
}

// ---- Settings, legal, messages ---------------------------------------------
export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await admin();
    requireRecentAuth(a);
    const kinds = fd.getAll("enabledFileKinds").map(String).filter((k): k is FileKind => ["image", "pdf", "docx", "pptx", "video"].includes(k));
    const patch = {
      uploadsPerDay: Math.max(0, Math.min(100, Number(str(fd, "uploadsPerDay")) || 0)),
      userStorageMb: Math.max(0, Math.min(10_000, Number(str(fd, "userStorageMb")) || 0)),
      enabledFileKinds: kinds,
      requireReapprovalAfterTitleEdit: bool(fd, "requireReapprovalAfterTitleEdit"),
      announcement: str(fd, "announcement").trim().slice(0, 300),
      maintenanceMode: bool(fd, "maintenanceMode"),
    };
    await saveSettings(patch);
    await audit(a, "settings.update", {}, null, patch as unknown as Record<string, unknown>);
    revalidatePath("/", "layout");
    return "Settings saved.";
  });
}

export async function publishLegalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await admin();
    requireRecentAuth(a);
    const type = (str(fd, "type") === "privacy" ? "privacy" : "terms") as LegalType;
    const body = str(fd, "body").trim();
    if (body.length < 200) throw new AppError("The document looks too short.");
    const version = await publishLegal(type, body, a.id);
    await audit(a, "legal.publish", { type: "legal", id: type }, null, { version });
    revalidatePath(`/${type}`);
    return `Published version ${version}. Members will be asked to accept it.`;
  });
}

export async function messageHandledAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await markMessageHandled(await admin(), str(fd, "id"));
    revalidatePath("/admin/messages");
  });
}

export async function messageDeleteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await deleteContactMessage(await admin(), str(fd, "id"));
    revalidatePath("/admin/messages");
  });
}

// ---- Security ----------------------------------------------------------------
export async function reauthAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const next = str(fd, "next");
  const result = await runAction(async () => {
    const a = await admin();
    const ok = await confirmAdminPassword(a.id, a.email, str(fd, "password"), await clientIp());
    if (!ok) throw new AppError("That password is incorrect.");
    await markReauthenticated(a.sessionId);
  });
  if (result?.ok) redirect(next.startsWith("/admin") ? next : "/admin");
  return result;
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await admin();
    await changeAdminPassword(a.id, a.email, str(fd, "current"), str(fd, "next"), await clientIp());
    await revokeOtherSessions(a.id, a.sessionId);
    await audit(a, "admin.password_changed");
    return "Password changed. Other sessions were signed out.";
  });
}

export async function enableTotpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await admin();
    // Replacing two-factor is as sensitive as turning it off.
    requireRecentAuth(a);
    const secret = decryptSecret(env.sessionSecret, str(fd, "secret"));
    if (!(await enableTotp(a.id, secret, str(fd, "code").replace(/\s+/g, "")))) throw new AppError("That code did not match. Try the current code.");
    await audit(a, "admin.totp_enabled");
    revalidatePath("/admin/security");
    return "Two-factor authentication is on.";
  });
}

export async function disableTotpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  void fd;
  return runAction(async () => {
    const a = await admin();
    requireRecentAuth(a);
    await disableTotp(a.id);
    await audit(a, "admin.totp_disabled");
    revalidatePath("/admin/security");
    return "Two-factor authentication is off.";
  });
}
