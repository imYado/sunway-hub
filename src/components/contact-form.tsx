import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CleanInput, CleanTextarea } from "@/components/ui/clean-input";
import { Field } from "@/components/ui/field";
import { contactAction } from "@/app/actions/contact";

export function ContactForm({ kind, defaultName, defaultEmail }: { kind: "contact" | "takedown"; defaultName?: string; defaultEmail?: string }) {
  return (
    <ActionForm action={contactAction} resetOnSuccess>
      <input type="hidden" name="kind" value={kind} />
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${kind}-website`}>Leave this empty</label>
        <input id={`${kind}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <Field label="Your name" htmlFor={`${kind}-name`}>
        <CleanInput id={`${kind}-name`} name="name" required maxLength={100} defaultValue={defaultName} autoComplete="name" />
      </Field>
      <Field label="Your email" htmlFor={`${kind}-email`} hint="So we can reply. It is only visible to the admin.">
        <input id={`${kind}-email`} name="email" type="email" required className="input" defaultValue={defaultEmail} autoComplete="email" />
      </Field>
      {kind === "takedown" ? (
        <Field label="Link to the content" htmlFor="takedown-url" hint="For example the address of the post on SJ Study.">
          <input id="takedown-url" name="contentUrl" type="url" required className="input" placeholder="https://.../posts/..." />
        </Field>
      ) : (
        <Field label="Subject" htmlFor="contact-subject">
          <CleanInput id="contact-subject" name="subject" maxLength={150} />
        </Field>
      )}
      <Field
        label={kind === "takedown" ? "Why should it be removed?" : "Message"}
        htmlFor={`${kind}-message`}
        hint={kind === "takedown" ? "Tell us what you own (for example your lecture slides) and how the content uses it." : undefined}
      >
        <CleanTextarea id={`${kind}-message`} name="message" required minLength={10} maxLength={3000} rows={6} showCount />
      </Field>
      <SubmitButton>{kind === "takedown" ? "Send takedown request" : "Send message"}</SubmitButton>
    </ActionForm>
  );
}
