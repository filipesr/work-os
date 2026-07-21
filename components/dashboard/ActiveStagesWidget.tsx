import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getMyActiveStages, getTeamBacklog } from "@/lib/actions/task";
import { getDueState } from "@/lib/dates";
import { stageAgingRatio } from "@/lib/team-health-format";
import { DEFAULT_SLA_HOURS, AGING_ALERT_RATIO } from "@/lib/actions/team-health";
import { ActiveStagesTable, type ActiveStageWithDetails } from "./ActiveStagesTable";

// Re-exported so external importers of this module keep working after the
// type moved to ActiveStagesTable.tsx.
export type { ActiveStageWithDetails };

// Limite suave de WIP (Personal Kanban): acima disto, um nudge discreto.
const WIP_SOFT_LIMIT = 5;

function FocusStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "red" | "amber";
}) {
  const color =
    tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-2xl font-bold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

// My Active Stages Widget — inclui o resumo "Meu foco" (WIP/envelhecendo/risco)
export async function MyActiveStagesWidget() {
  const t = await getTranslations("dashboard");
  const myActiveStages = await getMyActiveStages();

  const now = Date.now();
  let aging = 0;
  let overdue = 0;
  let dueSoon = 0;
  for (const s of myActiveStages) {
    if (
      stageAgingRatio(s.activatedAt, s.stage.expectedDurationHours ?? DEFAULT_SLA_HOURS, now) >=
      AGING_ALERT_RATIO
    ) {
      aging++;
    }
    const ds = getDueState(s.task.dueDate);
    if (ds === "overdue") overdue++;
    else if (ds === "dueSoon") dueSoon++;
  }
  const wip = myActiveStages.length;
  const atRisk = overdue + dueSoon;

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
      <div className="bg-primary/5 px-6 py-4 border-b-2 border-border flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-foreground">{t("myActiveStages.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {wip === 1
              ? t("myActiveStages.stageCount", { count: wip })
              : t("myActiveStages.stagesCount", { count: wip })}
          </p>
        </div>
        <Link href="/tasks" className="text-sm font-medium text-primary hover:underline">
          {t("myActiveStages.viewTasks")}
        </Link>
      </div>

      {wip > 0 && (
        <div className="px-6 pt-4">
          <dl className="grid grid-cols-3 gap-3">
            <FocusStat label={t("myFocus.wip")} value={wip} />
            <FocusStat label={t("myFocus.aging")} value={aging} tone={aging ? "red" : "default"} />
            <FocusStat
              label={t("myFocus.atRisk")}
              value={atRisk}
              tone={atRisk ? "amber" : "default"}
            />
          </dl>
          {wip > WIP_SOFT_LIMIT && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              💡 {t("myFocus.nudge", { count: wip })}
            </p>
          )}
        </div>
      )}

      <ActiveStagesTable
        stages={myActiveStages}
        t={t}
        showUnassign={true}
        showAging={true}
        emptyText={t("emptyStates.noActiveStages")}
      />
    </div>
  );
}

// Team Backlog Widget
export async function TeamBacklogWidget({ teamIds }: { teamIds: string[] }) {
  const t = await getTranslations("dashboard");
  const teamBacklogStages = await getTeamBacklog(teamIds);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
      <div className="bg-primary/5 px-6 py-4 border-b-2 border-border">
        <h2 className="text-xl font-bold text-foreground">{t("teamBacklog.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {teamBacklogStages.length === 1
            ? t("teamBacklog.stageCount", { count: teamBacklogStages.length })
            : t("teamBacklog.stagesCount", { count: teamBacklogStages.length })}
        </p>
      </div>

      <ActiveStagesTable
        stages={teamBacklogStages}
        t={t}
        showClaim={true}
        emptyText={t("emptyStates.teamBacklogClean")}
      />
    </div>
  );
}
