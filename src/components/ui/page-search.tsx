import { Search } from "lucide-react";

/** A search box that filters the page it sits on (a plain GET form, so it works without JavaScript). */
export function PageSearch({
  action,
  placeholder,
  defaultValue,
  keep = {},
  label,
}: {
  action: string;
  placeholder: string;
  defaultValue?: string;
  /** Other filters to keep when searching, e.g. the chosen type or sort. */
  keep?: Record<string, string | undefined>;
  label: string;
}) {
  return (
    <form method="get" action={action} role="search" className="relative mb-4">
      {Object.entries(keep).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label htmlFor="page-search" className="sr-only">
        {label}
      </label>
      <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
      <input
        id="page-search"
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={100}
        enterKeyHint="search"
        className="input rounded-full pl-11"
      />
    </form>
  );
}
