import Link from "next/link";

export const DISCLAIMER =
  "SJ Study is an unofficial, student-run, non-commercial project. It is not affiliated with or endorsed by Sunway University.";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto max-w-content px-4 py-10 text-sm text-muted sm:px-6">
        <p>{DISCLAIMER}</p>
        <nav aria-label="Legal" className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
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
