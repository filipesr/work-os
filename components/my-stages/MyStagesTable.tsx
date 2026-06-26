"use client";

import { useTranslations } from "next-intl";
import type { ActiveStageWithDetails } from "@/lib/actions/task";

interface MyStagesTableProps {
  stages: ActiveStageWithDetails[];
  showAssignee: boolean;
  onRowClick: (stage: ActiveStageWithDetails) => void;
}

const priorityStyles: Record<string, string> = {
  URGENT: "bg-red-100 text-red-800 border-red-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
  LOW: "bg-green-100 text-green-800 border-green-300",
};

const stageStatusStyles: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-800 border-blue-300",
  BLOCKED: "bg-gray-100 text-gray-800 border-gray-300",
  COMPLETED: "bg-green-100 text-green-800 border-green-300",
};

export function MyStagesTable({ stages, showAssignee, onRowClick }: MyStagesTableProps) {
  const t = useTranslations("myStages");

  const formatDate = (date: Date | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-muted/30">
          <tr>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              {t("table.task")}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              {t("table.project")}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              {t("table.stage")}
            </th>
            {showAssignee && (
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                {t("table.assignee")}
              </th>
            )}
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              {t("table.priority")}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              {t("table.status")}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              {t("table.dueDate")}
            </th>
          </tr>
        </thead>
        <tbody>
          {stages.map((activeStage) => {
            const task = activeStage.task;
            const stage = activeStage.stage;
            const isOverdue =
              task.dueDate &&
              new Date(task.dueDate) < new Date() &&
              activeStage.status !== "COMPLETED";
            const isDueSoon =
              task.dueDate &&
              !isOverdue &&
              new Date(task.dueDate).getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000;
            const isBlocked = activeStage.status === "BLOCKED";

            return (
              <tr
                key={activeStage.id}
                onClick={() => onRowClick(activeStage)}
                className={`
                  hover:bg-muted/50 transition-colors border-b border-border cursor-pointer
                  ${isOverdue ? "bg-red-50 dark:bg-red-950/20" : ""}
                  ${isDueSoon && !isOverdue ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
                  ${isBlocked ? "bg-gray-50 dark:bg-gray-950/20" : ""}
                `}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {isOverdue && (
                      <span title="Overdue" className="text-base">
                        🔥
                      </span>
                    )}
                    {isDueSoon && !isOverdue && (
                      <span title="Due soon" className="text-base">
                        ⚠️
                      </span>
                    )}
                    {isBlocked && (
                      <span title="Blocked" className="text-base">
                        🔒
                      </span>
                    )}
                    <span className="text-sm font-medium text-foreground">{task.title}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col">
                    <span className="text-sm text-foreground">{task.project.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {task.project.client.name}
                    </span>
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
                {showAssignee && (
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      {activeStage.assignee?.name || activeStage.assignee?.email || t("unassigned")}
                    </span>
                  </td>
                )}
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
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded-md border ${
                      stageStatusStyles[activeStage.status]
                    }`}
                  >
                    {t(`status.${activeStage.status}`)}
                  </span>
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
