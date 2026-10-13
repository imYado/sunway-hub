import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="text-sm text-muted">404</p>
      <h1 className="mt-2 text-xl font-semibold">We could not find that page</h1>
      <p className="mt-2 text-muted">It may have been removed, or the link may be wrong.</p>
      <Link href="/" className="btn mt-6">
        Go to the home page
      </Link>
    </div>
  );
}
