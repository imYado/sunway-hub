import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageTitle } from "@/components/ui/empty";
import { BUILT_IN_ALLOWED, BUILT_IN_BLOCKED } from "@/lib/profanity/words";
import { addWordsAction, removeWordAction } from "@/app/actions/admin";
import { requireAdminPage } from "@/server/actor";
import { listWords } from "@/server/dal/admin";

export const metadata: Metadata = { title: "Blocked words" };

function WordList({ list, rows }: { list: "blocked" | "allowed"; rows: { id: string; word: string }[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No custom words yet.</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {rows.map((w) => (
        <li key={w.id}>
          <ActionForm action={removeWordAction} className="badge gap-2">
            <input type="hidden" name="list" value={list} />
            <input type="hidden" name="id" value={w.id} />
            <span>{w.word}</span>
            <button type="submit" className="text-danger" aria-label={`Remove ${w.word}`}>
              Remove
            </button>
          </ActionForm>
        </li>
      ))}
    </ul>
  );
}

export default async function WordsPage() {
  const actor = await requireAdminPage();
  const { blocked, allowed } = await listWords(actor);
  return (
    <div className="space-y-8">
      <PageTitle>Blocked words</PageTitle>
      <p className="text-sm text-muted">
        Words apply everywhere text is entered (names, posts, bios, reports, file names and more). Matching ignores case, accents, repeated
        letters, leetspeak and inserted symbols. Use <code>word*</code> to match anywhere inside a word, and the allow-list for false positives.
        Changes apply within 30 seconds.
      </p>
      {(["blocked", "allowed"] as const).map((list) => (
        <section key={list} className="card p-4" aria-labelledby={`w-${list}`}>
          <h2 id={`w-${list}`} className="mb-3 text-lg font-semibold">
            {list === "blocked" ? "Custom blocked words" : "Allow-list (never blocked)"}
          </h2>
          <WordList list={list} rows={list === "blocked" ? blocked : allowed} />
          <ActionForm action={addWordsAction} resetOnSuccess className="mt-4">
            <input type="hidden" name="list" value={list} />
            <label htmlFor={`add-${list}`} className="label">
              Add words (one per line or comma-separated)
            </label>
            <textarea id={`add-${list}`} name="words" rows={3} className="input" />
            <label htmlFor={`file-${list}`} className="label mt-3">
              Or import a .txt or .csv file
            </label>
            <input id={`file-${list}`} name="file" type="file" accept=".txt,.csv,text/plain,text/csv" className="block w-full text-sm" />
            <div className="mt-3">
              <SubmitButton variant="default" size="sm">
                Add
              </SubmitButton>
            </div>
          </ActionForm>
        </section>
      ))}
      <details className="card p-4">
        <summary className="cursor-pointer font-medium">
          Built-in lists ({BUILT_IN_BLOCKED.length} blocked, {BUILT_IN_ALLOWED.length} allowed, plus the obscenity English dataset)
        </summary>
        <p className="mt-2 text-sm text-muted">Built-in words are part of the code (src/lib/profanity/words.ts). Use the allow-list above to override one.</p>
        <p className="mt-2 break-words text-sm">{BUILT_IN_BLOCKED.join(", ")}</p>
      </details>
    </div>
  );
}
