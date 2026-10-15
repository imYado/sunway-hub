/** Shown beside every place a private message is written. Wording approved by the site owner. */
export const DM_PRIVACY_NOTE =
  "Messages are encrypted when stored. Even so, please don't share passwords, bank details or other sensitive personal information here.";

export function DmPrivacyNote() {
  return <p className="mb-2 text-xs text-muted">{DM_PRIVACY_NOTE}</p>;
}
