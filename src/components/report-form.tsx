import { Flag } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CleanTextarea } from "@/components/ui/clean-input";
import { REPORT_NOTE_MAX, REPORT_REASONS } from "@/lib/rules";
import { reportAction } from "@/app/actions/posts";

export function ReportForm({
  targetType,
  targetId,
  className = "mt-4",
  label = "Report",
}: {
  targetType: "post" | "user" | "club" | "study_group" | "comment" | "message";
  targetId: string;
  className?: string;
  label?: string;
}) {
  const id = `report-${targetType}-${targetId}`;
  return (
    <details className={className}>
      <summary className="btn btn-sm cursor-pointer list-none">
        <Flag size={14} aria-hidden="true" /> {label}
      </summary>
      <div className="surface mt-2 p-4">
        <ActionForm action={reportAction} resetOnSuccess>
          <input type="hidden" name="targetType" value={targetType} />
          <input type="hidden" name="targetId" value={targetId} />
          <label htmlFor={`${id}-reason`} className="label">
            Reason
          </label>
          <select id={`${id}-reason`} name="reason" required className="input">
            {REPORT_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-note`} className="label mt-3">
            Note (optional)
          </label>
          <CleanTextarea id={`${id}-note`} name="note" maxLength={REPORT_NOTE_MAX} rows={3} />
          <div className="mt-3">
            <SubmitButton variant="default" size="sm">
              Send report
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
    </details>
  );
}
