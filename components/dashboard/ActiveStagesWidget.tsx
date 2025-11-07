import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getMyActiveStages, getTeamBacklog } from "@/lib/actions/task";
import { ClaimActiveStageButton } from "@/components/tasks/ClaimActiveStageButton";
import { UnassignActiveStageButton } from "@/components/tasks/UnassignActiveStageButton";
import { TaskPriority, TaskStatus, ActiveStageStatus } from "@prisma/client";

// Types
type ActiveStageWithDetails = {
  id: string;
  status: ActiveStageStatus;
  taskId: string;
  stageId: string;
  assigneeId: string | null;
  activatedAt: Date;
  completedAt: Date | null;
  task: {
    id: string;
    title: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: Date | null;
    createdAt: Date;
    project: {
      name: string;
    };
  };
  stage: {
    id: string;
    name: string;
    order: number;
    defaultTeam: {
      id: string;
      name: string;
    } | null;
    template: {
      id: string;
      name: string;
    };
  };
  assignee?: {
    name: string | null;
    email: string | null;
  } | null;
};

// Reusable table row component
async function ActiveStageRow({
  activeStage,
  showClaimButton = false,
  showUnassignButton = false,
}: {
  activeStage: ActiveStageWithDetails;
  showClaimButton?: boolean;
  showUnassignButton?: boolean;
}) {
  const t = await getTranslations("dashboard");
  const task = activeStage.task;
  const stage = activeStage.stage;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const isDueSoon =
    task.dueDate &&
    !isOverdue &&
    new Date(task.dueDate).getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000; // 2 days
  const isNew =
    Date.now() - new Date(task.createdAt).getTime() < 24 * 60 * 60 * 1000; // 24 hours
  const isBlocked = activeStage.status === "BLOCKED";

  // Priority styles
  const priorityStyles = {
    URGENT: "bg-red-100 text-red-800 border-red-300",
    HIGH: "bg-orange-100 text-orange-800 border-orange-300",
    MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
    LOW: "bg-green-100 text-green-800 border-green-300",
  };

  // Status styles
  const statusStyles = {
    BACKLOG: "bg-gray-100 text-gray-800 border-gray-300",
    IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-300",
    PAUSED: "bg-purple-100 text-purple-800 border-purple-300",
    COMPLETED: "bg-green-100 text-green-800 border-green-300",
    CANCELLED: "bg-red-100 text-red-800 border-red-300",
  };

  // Format date
  const formatDate = (date: Date | null) => {
    if (!date) return t("dates.noDueDate");
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <tr
      className={`
      hover:bg-muted/50 transition-colors border-b border-border
      ${isOverdue ? "bg-red-50 dark:bg-red-950/20" : ""}
      ${isDueSoon && !isOverdue ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
      ${isBlocked ? "bg-gray-50 dark:bg-gray-950/20" : ""}
    `}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {isOverdue && (
            <span title={t("tooltips.taskOverdue")} className="text-base">
              🔥
            </span>
          )}
          {isDueSoon && !isOverdue && (
            <span title={t("tooltips.deadlineSoon")} className="text-base">
              ⚠️
            </span>
          )}
          {isBlocked && (
            <span title={t("tooltips.stageBlocked")} className="text-base">
              🔒
            </span>
          )}
          <Link
            href={`/tasks/${task.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {task.title}
          </Link>
          {isNew && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded dark:bg-blue-900 dark:text-blue-200">
              {t("badges.new")}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {task.project.name}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {stage.order}
          </span>
          <span className="text-sm text-muted-foreground">{stage.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`px-2 py-1 text-xs font-medium rounded-md border ${
            priorityStyles[task.priority]
          }`}
        >
          {t(`priority.${task.priority}`)}
        </span>
      </td>
      <td className="px-4 py-3">
        {isBlocked ? (
          <span className="px-2 py-1 text-xs font-medium rounded-md border bg-gray-100 text-gray-800 border-gray-300">
            {t("status.BLOCKED")}
          </span>
        ) : (
          <span
            className={`px-2 py-1 text-xs font-medium rounded-md border ${
              statusStyles[task.status]
            }`}
          >
            {t(`status.${task.status}`)}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span
          className={`text-sm ${
            isOverdue ? "text-red-600 font-semibold" : "text-muted-foreground"
          }`}
        >
          {formatDate(task.dueDate)}
        </span>
      </td>
      {showClaimButton && (
        <td className="px-4 py-3">
          <ClaimActiveStageButton
            taskId={task.id}
            stageId={stage.id}
            isBlocked={isBlocked}
          />
        </td>
      )}
      {showUnassignButton && (
        <td className="px-4 py-3">
          <UnassignActiveStageButton
            taskId={task.id}
            stageId={stage.id}
            currentAssignee={
              activeStage.assignee?.name ||
              activeStage.assignee?.email ||
              null
            }
          />
        </td>
      )}
    </tr>
  );
}

// My Active Stages Widget
export async function MyActiveStagesWidget() {
  const t = await getTranslations("dashboard");
  const myActiveStages = await getMyActiveStages();

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
      <div className="bg-primary/5 px-6 py-4 border-b-2 border-border">
        <h2 className="text-xl font-bold text-foreground">
          {t("myActiveStages.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {myActiveStages.length === 1
            ? t("myActiveStages.stageCount", { count: myActiveStages.length })
            : t("myActiveStages.stagesCount", {
                count: myActiveStages.length,
              })}
        </p>
      </div>

      {myActiveStages.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            {t("emptyStates.noActiveStages")}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.task")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.project")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.currentStage")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.priority")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.status")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.dueDate")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.action")}
                </th>
              </tr>
            </thead>
            <tbody>
              {myActiveStages.map((activeStage) => (
                <ActiveStageRow
                  key={activeStage.id}
                  activeStage={activeStage}
                  showUnassignButton={true}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Team Backlog Widget
export async function TeamBacklogWidget({ teamId }: { teamId: string }) {
  const t = await getTranslations("dashboard");
  const teamBacklogStages = await getTeamBacklog(teamId);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
      <div className="bg-primary/5 px-6 py-4 border-b-2 border-border">
        <h2 className="text-xl font-bold text-foreground">
          {t("teamBacklog.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {teamBacklogStages.length === 1
            ? t("teamBacklog.stageCount", { count: teamBacklogStages.length })
            : t("teamBacklog.stagesCount", { count: teamBacklogStages.length })}
        </p>
      </div>

      {teamBacklogStages.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            {t("emptyStates.teamBacklogClean")}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.task")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.project")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.currentStage")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.priority")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.status")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.dueDate")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("table.action")}
                </th>
              </tr>
            </thead>
            <tbody>
              {teamBacklogStages.map((activeStage) => (
                <ActiveStageRow
                  key={activeStage.id}
                  activeStage={activeStage}
                  showClaimButton={true}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
