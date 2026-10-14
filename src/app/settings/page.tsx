import type { Metadata } from "next";
import { Avatar } from "@/components/ui/avatar";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CleanInput, CleanTextarea } from "@/components/ui/clean-input";
import { Field } from "@/components/ui/field";
import { formatDate } from "@/lib/dates";
import { BIO_MAX, DISPLAY_NAME_MAX, PRONOUN_OPTIONS, ROLE_OPTIONS, USERNAME_CHANGES_PER_WEEK, nextUsernameChange } from "@/lib/rules";
import {
  avatarAction,
  deleteAccountAction,
  emailVisibilityAction,
  notificationSettingsAction,
  requestDeletionCodeAction,
  signOutEverywhereAction,
  updateProfileAction,
} from "@/app/actions/profile";
import { requireMember } from "@/server/actor";
import { getNotificationSettings } from "@/server/dal/notifications";
import { getMe, getProfile } from "@/server/dal/users";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireMember();
  const me = await getMe(actor);
  const profile = await getProfile(actor, me.username!);
  const notif = await getNotificationSettings(actor);
  const nextChange = actor.isAdmin ? null : nextUsernameChange(me.usernamePrevChangedAt);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-xl font-semibold">Settings</h1>

      <section className="card p-4 sm:p-6" aria-labelledby="s-profile">
        <h2 id="s-profile" className="mb-4 text-lg font-semibold">
          Profile
        </h2>
        <ActionForm action={updateProfileAction}>
          <Field label="Full name" htmlFor="displayName">
            <CleanInput id="displayName" name="displayName" required maxLength={DISPLAY_NAME_MAX} defaultValue={me.displayName ?? ""} />
          </Field>
          <Field
            label="Username"
            htmlFor="username"
            hint={nextChange ? `You can change your username again on ${formatDate(nextChange)}.` : actor.isAdmin ? "You can change it as often as you like." : `You can change it ${USERNAME_CHANGES_PER_WEEK} times a week.`}
          >
            <CleanInput id="username" name="username" required pattern="[a-z0-9_]{2,20}" defaultValue={me.username ?? ""} aria-describedby="username-hint" />
          </Field>
          <Field label="Role" htmlFor="roleLabel" hint="Choosing Teacher shows a pending label until the admin verifies it. It does not give extra permissions.">
            <select id="roleLabel" name="roleLabel" defaultValue={me.roleLabel} className="input">
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pronouns" htmlFor="pronouns">
            <select id="pronouns" name="pronouns" defaultValue={me.pronouns} className="input">
              {PRONOUN_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Bio" htmlFor="bio">
            <CleanTextarea id="bio" name="bio" maxLength={BIO_MAX} rows={3} defaultValue={me.bio ?? ""} showCount />
          </Field>
          <SubmitButton>Save profile</SubmitButton>
        </ActionForm>
      </section>

      <section className="card p-4 sm:p-6" aria-labelledby="s-avatar">
        <h2 id="s-avatar" className="mb-4 text-lg font-semibold">
          Profile picture
        </h2>
        <div className="mb-4 flex items-center gap-4">
          <Avatar userId={me.id} name={me.displayName} hasImage={!!profile.avatar.approvedFileId} size={64} />
          {profile.avatar.pendingFileId && (
            <div className="flex items-center gap-2">
              <Avatar userId={me.id} name={me.displayName} hasImage pending size={64} />
              <span className="badge">Pending approval</span>
            </div>
          )}
        </div>
        {profile.avatar.lastRejectionReason && (
          <p className="mb-4 text-sm text-danger">Your last picture was not approved: {profile.avatar.lastRejectionReason}</p>
        )}
        <ActionForm action={avatarAction} resetOnSuccess>
          <label htmlFor="avatar" className="label">
            Upload a new picture
          </label>
          <input id="avatar" name="avatar" type="file" accept=".jpg,.jpeg,.png,.webp" required className="block w-full text-sm" aria-describedby="avatar-hint" />
          <p id="avatar-hint" className="hint">
            JPG, PNG or WebP, up to 2 MB. It is cropped to a square. Others see it after the admin approves it.
          </p>
          <div className="mt-3">
            <SubmitButton variant="default">Upload</SubmitButton>
          </div>
        </ActionForm>
        {(profile.avatar.approvedFileId || profile.avatar.pendingFileId) && (
          <ActionForm action={avatarAction} className="mt-3">
            <input type="hidden" name="remove" value="1" />
            <SubmitButton variant="danger" size="sm">
              Remove picture
            </SubmitButton>
          </ActionForm>
        )}
      </section>

      <section className="card p-4 sm:p-6" aria-labelledby="s-privacy">
        <h2 id="s-privacy" className="mb-2 text-lg font-semibold">
          Email visibility
        </h2>
        <p className="mb-4 text-sm text-muted">Your email ({me.email}) is always visible to you and the admin.</p>
        <ActionForm action={emailVisibilityAction}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="emailPublic" defaultChecked={me.emailPublic} className="h-4 w-4" />
            Show my email on my profile to other members
          </label>
          <div className="mt-3">
            <SubmitButton variant="default" size="sm">
              Save
            </SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className="card p-4 sm:p-6" aria-labelledby="s-notif">
        <h2 id="s-notif" className="mb-4 text-lg font-semibold">
          Notifications
        </h2>
        <ActionForm action={notificationSettingsAction}>
          <fieldset className="space-y-2 text-sm">
            <legend className="sr-only">Notification preferences</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="inAppFollowed" defaultChecked={notif.inAppFollowed} className="h-4 w-4" />
              In-app notifications for new posts in subjects and clubs I follow
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="emailDigest" defaultChecked={notif.emailDigest} className="h-4 w-4" />
              Daily email digest of new posts I follow
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="emailDecisions" defaultChecked={notif.emailDecisions} className="h-4 w-4" />
              Email me about decisions on my posts, pictures and requests (sent once a day)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="emailEventReminders" defaultChecked={notif.emailEventReminders} className="h-4 w-4" />
              Email reminders for events I RSVPed to
            </label>
          </fieldset>
          <div className="mt-3">
            <SubmitButton variant="default" size="sm">
              Save notification settings
            </SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className="card p-4 sm:p-6" aria-labelledby="s-security">
        <h2 id="s-security" className="mb-2 text-lg font-semibold">
          Sign-in and data
        </h2>
        <div className="flex flex-wrap gap-2">
          <ActionForm action={signOutEverywhereAction}>
            <SubmitButton variant="default" size="sm">
              Sign out on all other devices
            </SubmitButton>
          </ActionForm>
          <a href="/api/me/export" className="btn btn-sm">
            Download my data (JSON)
          </a>
        </div>
      </section>

      {!actor.isAdmin && (
        <section className="card border-danger p-4 sm:p-6" aria-labelledby="s-delete">
          <h2 id="s-delete" className="mb-2 text-lg font-semibold text-danger">
            Delete my account
          </h2>
          <p className="mb-4 text-sm">
            Your profile and personal data are erased right away. Choose what happens to your posts. To confirm, we email you a code.
          </p>
          <ActionForm action={requestDeletionCodeAction}>
            <SubmitButton variant="default" size="sm">
              Email me a confirmation code
            </SubmitButton>
          </ActionForm>
          <ActionForm action={deleteAccountAction} className="mt-4" confirm="Delete your account permanently? This cannot be undone.">
            <fieldset className="mb-3 space-y-2 text-sm">
              <legend className="label">My posts</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" value="anonymise_posts" defaultChecked className="h-4 w-4" />
                Keep my posts, shown as &quot;Deleted user&quot;
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="mode" value="delete_posts" className="h-4 w-4" />
                Delete my posts too
              </label>
            </fieldset>
            <label htmlFor="delete-code" className="label">
              Confirmation code
            </label>
            <input id="delete-code" name="code" inputMode="numeric" maxLength={6} required className="input mb-3 max-w-40" />
            <SubmitButton variant="danger" size="sm">
              Delete my account
            </SubmitButton>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
