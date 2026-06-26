"use client";

import { useTranslations } from "next-intl";

type Member = { id: string; name: string | null; email: string | null };

/** Native <select> for assigning a user to a stage.
 *
 * **Uncontrolled mode** (Task 9 — create-form): omit `value`/`onChange`.
 *   The select renders with `name="assignee:<stageId>"` so it posts with the form.
 *
 * **Controlled mode** (Task 10 — advance modal): provide both `value` and
 *   `onChange`. The `name` attribute is omitted; state is managed by the parent.
 *
 * Renders a "no team" text span when the stage has no team (nothing to assign to).
 */
export function StageAssigneeSelect({
  stageId,
  teamName,
  members,
  value,
  onChange,
}: {
  stageId: string;
  teamName: string | null;
  members: Member[];
  /** Controlled value. Provide together with `onChange` to enable controlled mode. */
  value?: string;
  /** Controlled change handler. Provide together with `value` to enable controlled mode. */
  onChange?: (v: string) => void;
}) {
  const t = useTranslations("tasks.create.assign");

  if (!teamName) {
    return <span className="text-xs text-muted-foreground">{t("noTeam")}</span>;
  }

  const isControlled = value !== undefined && onChange !== undefined;

  return (
    <select
      {...(!isControlled ? { name: `assignee:${stageId}`, defaultValue: "" } : {})}
      {...(isControlled ? { value, onChange: (e) => onChange(e.target.value) } : {})}
      aria-label={t("ariaLabel", { team: teamName })}
      className="h-8 rounded-md border border-input-border bg-input px-2 text-sm text-foreground focus-visible:outline-none focus-visible:border-primary"
    >
      <option value="">{t("unassigned")}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name || m.email}
        </option>
      ))}
    </select>
  );
}
