import { Lock } from "lucide-react";
import { DM_PRIVACY_NOTE } from "./privacy-note";

/** A centred box inside the chat, like the notices other messaging apps show above a conversation. */
export function ChatNotice({ title, children, icon }: { title?: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div role="note" className="mx-auto my-3 max-w-sm rounded-[16px] border border-line bg-surface px-4 py-3 text-center text-sm">
      {icon && <div className="mb-1 flex justify-center text-muted">{icon}</div>}
      {title && <p className="font-semibold">{title}</p>}
      <div className="text-muted">{children}</div>
    </div>
  );
}

export function PrivacyChatNotice() {
  return <ChatNotice icon={<Lock size={16} aria-hidden="true" />}>{DM_PRIVACY_NOTE}</ChatNotice>;
}
