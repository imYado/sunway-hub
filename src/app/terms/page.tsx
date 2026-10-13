import type { Metadata } from "next";
import { Markdown } from "@/components/ui/markdown";
import { DISCLAIMER } from "@/components/layout/footer";
import { formatDate } from "@/lib/dates";
import { getLatestLegal } from "@/server/legal";

export const metadata: Metadata = { title: "Terms and Conditions" };

export default async function TermsPage() {
  const doc = await getLatestLegal("terms");
  return (
    <article className="mx-auto max-w-2xl">
      <Markdown source={doc.body} />
      <p className="mt-8 text-sm text-muted">
        Version {doc.version}
        {doc.publishedAt ? `, published ${formatDate(doc.publishedAt)}` : ""}. {DISCLAIMER}
      </p>
    </article>
  );
}
