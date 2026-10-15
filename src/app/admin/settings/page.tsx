import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageTitle } from "@/components/ui/empty";
import { Field } from "@/components/ui/field";
import { env } from "@/lib/env";
import { FILE_RULES, formatBytes, type FileKind } from "@/lib/files";
import { saveSettingsAction } from "@/app/actions/admin";
import { requireAdminPage } from "@/server/actor";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Site settings" };

export default async function SettingsAdminPage() {
  await requireAdminPage();
  const s = await getSettings();
  return (
    <div>
      <PageTitle>Site settings</PageTitle>
      <ActionForm action={saveSettingsAction} className="card space-y-2 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Uploads per member per day" htmlFor="uploadsPerDay">
            <input id="uploadsPerDay" name="uploadsPerDay" type="number" min={0} max={100} defaultValue={s.uploadsPerDay} className="input" />
          </Field>
          <Field label="Storage per member (MB)" htmlFor="userStorageMb">
            <input id="userStorageMb" name="userStorageMb" type="number" min={0} max={10000} defaultValue={s.userStorageMb} className="input" />
          </Field>
        </div>
        <fieldset className="mb-4">
          <legend className="label">Allowed file types</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {(Object.keys(FILE_RULES) as FileKind[]).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="checkbox" name="enabledFileKinds" value={k} defaultChecked={s.enabledFileKinds.includes(k)} className="h-4 w-4" />
                {FILE_RULES[k].label} (max {formatBytes(FILE_RULES[k].maxBytes)})
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Announcement banner (shown on every page, leave empty for none)" htmlFor="announcement">
          <textarea id="announcement" name="announcement" rows={2} maxLength={300} defaultValue={s.announcement} className="input" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="maintenanceMode" defaultChecked={s.maintenanceMode} className="h-4 w-4" />
          Maintenance mode (members see a maintenance notice; you can still use the site)
        </label>
        <div className="pt-2">
          <SubmitButton>Save settings</SubmitButton>
        </div>
      </ActionForm>
      <section className="card mt-6 p-4 text-sm" aria-labelledby="env">
        <h2 id="env" className="mb-2 text-lg font-semibold">
          From environment variables (read only)
        </h2>
        <p>Allowed email domains: {env.allowedEmailDomains.join(", ") || "(none set)"}</p>
        <p>Storage cap: {formatBytes(env.storageCapBytes)} (warning at 80%, uploads refused at 90%)</p>
        <p>Admin email: {env.adminEmail}</p>
      </section>
    </div>
  );
}
