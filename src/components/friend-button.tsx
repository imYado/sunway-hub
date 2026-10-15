import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { friendAction } from "@/app/actions/friends";
import type { FriendState } from "@/server/dal/friends";

function Op({ userId, op, path, label, variant = "default", confirm }: { userId: string; op: string; path: string; label: string; variant?: "default" | "primary" | "danger"; confirm?: string }) {
  return (
    <ActionForm action={friendAction} confirm={confirm}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="path" value={path} />
      <SubmitButton variant={variant} size="sm">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

/** Add friend / Requested / Accept or Decline / Friends, depending on where the two people stand. */
export function FriendButton({ userId, state, path, name }: { userId: string; state: FriendState; path: string; name: string }) {
  if (state === "self") return null;
  if (state === "none") return <Op userId={userId} op="add" path={path} label="Add friend" variant="primary" />;
  if (state === "outgoing") return <Op userId={userId} op="remove" path={path} label="Cancel request" />;
  if (state === "incoming") {
    return (
      <>
        <Op userId={userId} op="accept" path={path} label="Accept friend request" variant="primary" />
        <Op userId={userId} op="decline" path={path} label="Decline" />
      </>
    );
  }
  return <Op userId={userId} op="remove" path={path} label="Unfriend" confirm={`Unfriend ${name}? You'll both be removed from each other's friends.`} />;
}
