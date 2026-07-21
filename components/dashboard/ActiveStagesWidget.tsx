import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getMyActiveStages, getTeamBacklog } from "@/lib/actions/task";
import { ActiveStagesTable, type ActiveStageWithDetails } from "./ActiveStagesTable";

// Re-exported so external importers of this module keep working after the
// type moved to ActiveStagesTable.tsx.
export type { ActiveStageWithDetails };

// My Active Stages Widget
export async function MyActiveStagesWidget() {
  const t = await getTranslations("dashboard");
  const myActiveStages = await getMyActiveStages();

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
      <div className="bg-primary/5 px-6 py-4 border-b-2 border-border flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-foreground">{t("myActiveStages.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {myActiveStages.length === 1
              ? t("myActiveStages.stageCount", { count: myActiveStages.length })
              : t("myActiveStages.stagesCount", {
                  count: myActiveStages.length,
                })}
          </p>
        </div>
        <Link href="/tasks" className="text-sm font-medium text-primary hover:underline">
          {t("myActiveStages.viewTasks")}
        </Link>
      </div>

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
