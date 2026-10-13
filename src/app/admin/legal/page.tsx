import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageTitle } from "@/components/ui/empty";
import { formatDate } from "@/lib/dates";
import { publishLegalAction } from "@/app/actions/admin";
import { requireAdminPage } from "@/server/actor";
import { getLatestLegal } from "@/server/legal";

export const metadata: Metadata = { title: "Legal" };

export default async function LegalAdminPage() {
  await requireAdminPage();
  const docs = await Promise.all([getLatestLegal("terms"), getLatestLegal("privacy")]);
  return (
    <div className="space-y-8">
      <PageTitle>Legal documents</PageTitle>
      <p className="text-sm text-muted">
        Publishing creates a new version. Every member is asked to accept it before they can keep using the site. Formatting: <code># Heading</code>,{" "}
        <code>## Section</code>, <code>- bullet</code>, <code>**bold**</code>.
      </p>
      {docs.map((d) => (
        <section key={d.type} className="card p-4" aria-labelledby={`l-${d.type}`}>
          <h2 id={`l-${d.type}`} className="text-lg font-semibold">
            {d.type === "terms" ? "Terms and Conditions" : "Privacy Policy"}
          </h2>
          <p className="mb-3 text-sm text-muted">
            Current version {d.version}
            {d.publishedAt ? `, published ${formatDate(d.publishedAt)}` : " (draft template, not yet in the database)"} ·{" "}
            <Link href={`/${d.type}`}>View</Link>
          </p>
          <ActionForm action={publishLegalAction} confirm="Publish a new version? All members will be asked to accept it.">
            <input type="hidden" name="type" value={d.type} />
            <label htmlFor={`body-${d.type}`} className="label">
              Text
            </label>
            <textarea id={`body-${d.type}`} name="body" rows={16} defaultValue={d.body} className="input font-mono text-sm" />
            <div className="mt-3">
              <SubmitButton>Publish new version</SubmitButton>
            </div>
          </ActionForm>
        </section>
      ))}
    </div>
  );
}
