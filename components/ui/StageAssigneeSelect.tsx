"use client";

import { useTranslations } from "next-intl";

type Member = { id: string; name: string | null; email: string | null };

/** Native <select> that emits `assignee:<stageId>` so it posts with the form.
 * Renders disabled when the stage has no team (nothing to assign to). */
export function StageAssigneeSelect({
  stageId,
  teamName,
  members,
}: {
  stageId: string;
  teamName: string | null;
  members: Member[];
}) {
  const t = useTranslations("tasks.create.assign");

  if (!teamName) {
    return <span className="text-xs text-muted-foreground">{t("noTeam")}</span>;
  }

  return (
    <select
      name={`assignee:${stageId}`}
      defaultValue=""
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
