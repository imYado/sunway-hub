import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { getActor } from "@/server/actor";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const actor = await getActor();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">Contact and feedback</h1>
      <p className="mt-2 text-muted">
        Questions, feedback, privacy requests or appeals: send a message below or email <a href="mailto:hubsunway@gmail.com">hubsunway@gmail.com</a>. To report copyrighted
        content, use the <a href="/copyright">Copyright and Takedown</a> page.
      </p>
      <div className="card mt-6 p-4 sm:p-6">
        <ContactForm kind="contact" defaultName={actor?.displayName ?? undefined} defaultEmail={actor?.email} />
      </div>
    </div>
  );
}
