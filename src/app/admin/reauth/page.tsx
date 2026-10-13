import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { reauthAction } from "@/app/actions/admin";
import { requireAdminPage } from "@/server/actor";

export const metadata: Metadata = { title: "Confirm password" };

export default async function ReauthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await requireAdminPage();
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold">Confirm your password</h1>
      <p className="mb-4 mt-1 text-sm text-muted">Sensitive admin actions need your password again. This lasts 15 minutes.</p>
      <ActionForm action={reauthAction} className="card p-4">
        <input type="hidden" name="next" value={next ?? "/admin"} />
        <label htmlFor="password" className="label">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input mb-3" />
        <SubmitButton>Confirm</SubmitButton>
      </ActionForm>
    </div>
  );
}
