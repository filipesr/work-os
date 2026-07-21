import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { priorityBadgeClass, taskStatusBadgeClass } from "@/lib/status-styles";
import { formatDisplayDate, getDueState } from "@/lib/dates";
import { stageAgingRatio, formatAge } from "@/lib/team-health-format";
import { DEFAULT_SLA_HOURS, AGING_ALERT_RATIO } from "@/lib/actions/team-health";
import { ClaimActiveStageButton } from "@/components/tasks/ClaimActiveStageButton";
import { UnassignActiveStageButton } from "@/components/tasks/UnassignActiveStageButton";
import { TaskPriority, TaskStatus, ActiveStageStatus } from "@prisma/client";

// The translator returned by getTranslations("dashboard"), passed down so each
// row reuses the parent's single instance instead of awaiting its own (N+1).
type DashboardTranslator = Awaited<ReturnType<typeof getTranslations<"dashboard">>>;

// Types
export type ActiveStageWithDetails = {
  id: string;
  status: ActiveStageStatus;
  taskId: string;
  stageId: string;
  assigneeId: string | null;
  activatedAt: Date;
  assignedAt?: Date | null;
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
      client: { name: string };
    };
  };
  stage: {
    id: string;
    name: string;
    order: number;
    expectedDurationHours?: number | null;
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
function ActiveStageRow({
  activeStage,
  t,
  showClaimButton = false,
  showUnassignButton = false,
  showAging = false,
}: {
  activeStage: ActiveStageWithDetails;
  t: DashboardTranslator;
  showClaimButton?: boolean;
  showUnassignButton?: boolean;
  showAging?: boolean;
}) {
  const task = activeStage.task;
  const stage = activeStage.stage;
  const now = Date.now();
  const dueState = getDueState(task.dueDate);
  const isOverdue = dueState === "overdue";
  const isDueSoon = dueState === "dueSoon";
  const isNew = now - new Date(task.createdAt).getTime() < 24 * 60 * 60 * 1000; // 24 hours
  const isBlocked = activeStage.status === "BLOCKED";
  const isAging =
    showAging &&
    stageAgingRatio(
      activeStage.activatedAt,
      stage.expectedDurationHours ?? DEFAULT_SLA_HOURS,
      now
    ) >= AGING_ALERT_RATIO;
  const createdAgeHours = (now - new Date(task.createdAt).getTime()) / 3.6e6;
  const mineAgeHours =
    (now - new Date(activeStage.assignedAt ?? activeStage.activatedAt).getTime()) / 3.6e6;

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
          {isAging && (
            <span title={t("tooltips.stageAging")} className="text-base">
              ⏳
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
        <div className="flex flex-col">
          <span className="text-sm text-foreground">{task.project.name}</span>
          <span className="text-xs text-muted-foreground">{task.project.client.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {stage.order}
          </span>
          <span className="text-sm text-muted-foreground">{stage.name}</span>
        </div>
      </td>
      {/* Status unificado: prioridade + status */}
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1">
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded-md border ${priorityBadgeClass(
              task.priority
            )}`}
          >
            {t(`priority.${task.priority}`)}
          </span>
          {isBlocked ? (
            <span className="px-2 py-0.5 text-xs font-medium rounded-md border bg-gray-100 text-gray-800 border-gray-300">
              {t("status.BLOCKED")}
            </span>
          ) : (
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-md border ${taskStatusBadgeClass(
                task.status
              )}`}
            >
              {t(`status.${task.status}`)}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`text-sm ${
            isOverdue ? "text-red-600 font-semibold" : "text-muted-foreground"
          }`}
        >
          {formatDisplayDate(task.dueDate, t("dates.noDueDate"))}
        </span>
      </td>
      {/* Tempo desde a criação da tarefa */}
      <td className="px-4 py-3">
        <span className="text-sm text-muted-foreground tabular-nums">
          {formatAge(createdAgeHours)}
        </span>
      </td>
      {/* Tempo que a etapa é minha (desde a atribuição) */}
      <td className="px-4 py-3">
        <span className="text-sm text-muted-foreground tabular-nums">
          {activeStage.assigneeId ? formatAge(mineAgeHours) : "—"}
        </span>
      </td>
      {showClaimButton && (
        <td className="px-4 py-3">
          <ClaimActiveStageButton taskId={task.id} stageId={stage.id} isBlocked={isBlocked} />
        </td>
      )}
      {showUnassignButton && (
        <td className="px-4 py-3">
          <UnassignActiveStageButton
            taskId={task.id}
            stageId={stage.id}
            currentAssignee={activeStage.assignee?.name || activeStage.assignee?.email || null}
          />
        </td>
      )}
    </tr>
  );
}

// Shared table: header + body + empty state, reused by both dashboard widgets.
export function ActiveStagesTable({
  stages,
  t,
  showClaim = false,
  showUnassign = false,
  showAging = false,
  emptyText,
}: {
  stages: ActiveStageWithDetails[];
  t: DashboardTranslator;
  showClaim?: boolean;
  showUnassign?: boolean;
  showAging?: boolean;
  emptyText: string;
}) {
  if (stages.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  const th =
    "px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider";

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/30">
          <tr>
            <th className={th}>{t("table.task")}</th>
            <th className={th}>{t("table.project")}</th>
            <th className={th}>{t("table.currentStage")}</th>
            <th className={th}>{t("table.status")}</th>
            <th className={th}>{t("table.dueDate")}</th>
            <th className={th}>{t("table.createdAge")}</th>
            <th className={th}>{t("table.mineAge")}</th>
            <th className={th}>{t("table.action")}</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((activeStage) => (
            <ActiveStageRow
              key={activeStage.id}
              activeStage={activeStage}
              t={t}
              showClaimButton={showClaim}
              showUnassignButton={showUnassign}
              showAging={showAging}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
