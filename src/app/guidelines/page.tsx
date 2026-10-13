import type { Metadata } from "next";
import { Markdown } from "@/components/ui/markdown";
import { GUIDELINES } from "@/content/guidelines";

export const metadata: Metadata = { title: "Community Guidelines" };

export default function GuidelinesPage() {
  return (
    <article className="mx-auto max-w-2xl">
      <Markdown source={GUIDELINES} />
    </article>
  );
}
