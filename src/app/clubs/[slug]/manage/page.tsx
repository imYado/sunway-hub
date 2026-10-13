import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CleanInput, CleanTextarea } from "@/components/ui/clean-input";
import { Field } from "@/components/ui/field";
import { ClubLogo } from "@/components/club-logo";
import { SOCIAL_KEYS } from "@/lib/rules";
import { clubLogoAction, updateClubAction } from "@/app/actions/clubs";
import { requireMember } from "@/server/actor";
import { NotFoundError } from "@/server/errors";
import { getClub } from "@/server/dal/clubs";

export const metadata: Metadata = { title: "Edit club" };

export default async function ManageClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const actor = await requireMember();
  const { slug } = await params;
  let detail;
  try {
    detail = await getClub(actor, slug);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  if (!detail.isManager && !actor.isAdmin) notFound();
  const { club } = detail;
  const path = `/clubs/${club.slug}`;
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <Link href={path} className="text-sm">
          Back to {club.name}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Edit {club.name}</h1>
        <p className="mt-1 text-sm text-muted">Events and club posts you publish still need admin approval.</p>
      </div>
      <section className="card p-4 sm:p-6">
        <ActionForm action={updateClubAction}>
          <input type="hidden" name="clubId" value={club.id} />
          <input type="hidden" name="path" value={path} />
          <Field label="Description" htmlFor="description">
            <CleanTextarea id="description" name="description" maxLength={2000} rows={6} defaultValue={club.description} showCount />
          </Field>
          {SOCIAL_KEYS.map((k) => (
            <Field key={k} label={k === "website" ? "Website (full address)" : `${k[0].toUpperCase()}${k.slice(1)} handle`} htmlFor={`social-${k}`}>
              <CleanInput id={`social-${k}`} name={k} defaultValue={club.socials[k] ?? ""} maxLength={200} type={k === "website" ? "url" : "text"} />
            </Field>
          ))}
          <SubmitButton>Save</SubmitButton>
        </ActionForm>
      </section>
      <section className="card p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Logo</h2>
        <div className="mb-4 flex items-center gap-4">
          <ClubLogo clubId={club.id} name={club.name} hasLogo={!!club.logoFileId} size={64} />
          {detail.pendingLogo && (
            <>
              <ClubLogo clubId={club.id} name={club.name} hasLogo pending size={64} />
              <span className="badge">Pending approval</span>
            </>
          )}
        </div>
        <ActionForm action={clubLogoAction} resetOnSuccess>
          <input type="hidden" name="clubId" value={club.id} />
          <input type="hidden" name="path" value={`${path}/manage`} />
          <label htmlFor="logo" className="label">
            Upload a logo
          </label>
          <input id="logo" name="logo" type="file" accept=".jpg,.jpeg,.png,.webp" required className="block w-full text-sm" />
          <p className="hint">JPG, PNG or WebP up to 2 MB. Cropped to a square. Shown after admin approval.</p>
          <div className="mt-3">
            <SubmitButton variant="default">Upload logo</SubmitButton>
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
