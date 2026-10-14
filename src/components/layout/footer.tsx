import Link from "next/link";

export const DISCLAIMER =
  "SJ Study is an unofficial, student-run, non-commercial project. It is not affiliated with or endorsed by Sunway University.";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-muted">
        <p>{DISCLAIMER}</p>
        <nav aria-label="Legal" className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/terms">Terms and Conditions</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/guidelines">Community Guidelines</Link>
          <Link href="/copyright">Copyright and Takedown</Link>
          <Link href="/contact">Contact</Link>
        </nav>
      </div>
    </footer>
  );
}
