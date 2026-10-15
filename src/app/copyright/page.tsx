// DRAFT - have this reviewed by Sunway Student LIFE or a qualified lawyer before launch.
import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { getActor } from "@/server/actor";

export const metadata: Metadata = { title: "Copyright and Takedown" };

export default async function CopyrightPage() {
  const actor = await getActor();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">Copyright and Takedown</h1>
      <div className="mt-4 space-y-4">
        <p>
          SJ Study only allows members to share work they own or have permission to share. Lecturers&apos; slides, textbooks, exam papers and
          assessment solutions are not allowed.
        </p>
        <p>
          If you are a rights holder or a lecturer and you believe content on SJ Study uses your work without permission, tell us using the
          form below or email <a href="mailto:hubsunway@gmail.com">hubsunway@gmail.com</a>.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>When a signed-in member sends a request about a post on this site, the post is hidden straight away while we review it. Other requests are reviewed by the admin.</li>
          <li>Our target is to review and remove infringing content within 48 hours.</li>
          <li>We may contact the member who posted it and may suspend repeat infringers.</li>
          <li>If you posted the content and believe it was removed by mistake, email us with the details.</li>
        </ul>
      </div>
      <div className="card mt-8 p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">Request removal</h2>
        <ContactForm kind="takedown" defaultName={actor?.displayName ?? undefined} defaultEmail={actor?.email} />
      </div>
    </div>
  );
}
