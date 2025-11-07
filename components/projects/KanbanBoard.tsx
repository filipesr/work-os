"use client";

import { useState, useMemo } from "react";
import { Task, User, TemplateStage, Project, Client, Team } from "@prisma/client";
import { TaskCard } from "./TaskCard";
import { KanbanFilters, FilterState } from "./KanbanFilters";
import { useTranslations } from "next-intl";

type TaskWithRelations = Task & {
  assignee: Pick<User, "id" | "name" | "email" | "image" | "teamId"> | null;
  currentStage: (TemplateStage & { defaultTeam: Team | null; template: { id: string; name: string } }) | null;
  currentStageId: string | null;
  project: Project & { client: Client };
};

type StageInfo = {
  id: string;
  name: string;
  order: number;
  templateId: string;
  templateName: string;
  defaultTeam: Team | null;
};

interface KanbanBoardProps {
  project: Project & { client: Client };
  tasks: TaskWithRelations[];
  stages: StageInfo[];
  currentUserId: string;
  currentUserTeamId: string | null;
}

export function KanbanBoard({
  project,
  tasks,
  stages,
  currentUserId,
  currentUserTeamId,
}: KanbanBoardProps) {
  const t = useTranslations("projects");
  const [filters, setFilters] = useState<FilterState>({
    myTasks: false,
    byTeam: false,
    assigneeId: null,
    priority: null,
  });

  // Apply filters to tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Filter: My Tasks
      if (filters.myTasks && task.assigneeId !== currentUserId) {
        return false;
      }

      // Filter: By Team
      if (filters.byTeam && currentUserTeamId) {
        if (task.currentStage?.defaultTeam?.id !== currentUserTeamId) {
          return false;
        }
      }

      // Filter: By Assignee
      if (filters.assigneeId && task.assigneeId !== filters.assigneeId) {
        return false;
      }

      // Filter: By Priority
      if (filters.priority && task.priority !== filters.priority) {
        return false;
      }

      return true;
    });
  }, [tasks, filters, currentUserId, currentUserTeamId]);

  // Group tasks by stage
  const tasksByStage = useMemo(() => {
    const grouped = new Map<string, TaskWithRelations[]>();

    // Initialize all stages with empty arrays
    stages.forEach((stage) => {
      grouped.set(stage.id, []);
    });

    // Group filtered tasks
    filteredTasks.forEach((task) => {
      if (task.currentStageId) {
        const stageTasks = grouped.get(task.currentStageId) || [];
        stageTasks.push(task);
        grouped.set(task.currentStageId, stageTasks);
      }
    });

    return grouped;
  }, [filteredTasks, stages]);

  // Get all unique assignees for filter dropdown
  const assignees = useMemo(() => {
    const uniqueAssignees = new Map<string, User>();
    tasks.forEach((task) => {
      if (task.assignee) {
        uniqueAssignees.set(task.assignee.id, task.assignee as User);
      }
    });
    return Array.from(uniqueAssignees.values());
  }, [tasks]);

  return (
    <div className="flex flex-col gap-6">
      {/* Filters */}
      <KanbanFilters
        filters={filters}
        onFiltersChange={setFilters}
        assignees={assignees}
        hasTeam={!!currentUserTeamId}
      />

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageTasks = tasksByStage.get(stage.id) || [];

          return (
            <div
              key={stage.id}
              className="flex-shrink-0 w-80 bg-muted/30 rounded-lg p-4"
            >
              {/* Column Header */}
              <div className="mb-4">
                <h3 className="font-semibold text-lg">{stage.name}</h3>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm text-muted-foreground">
                    {stage.templateName}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {stageTasks.length === 1
                      ? t("taskCount", { count: stageTasks.length })
                      : t("tasksCount", { count: stageTasks.length })
                    }
                  </span>
                </div>
                {stage.defaultTeam && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("team")}: {stage.defaultTeam.name}
                  </p>
                )}
              </div>

              {/* Tasks in this column */}
              <div className="flex flex-col gap-3">
                {stageTasks.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    {t("noTasks")}
                  </div>
                ) : (
                  stageTasks.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))
                )}
              </div>
            </div>
          );
        })}

        {stages.length === 0 && (
          <div className="flex items-center justify-center w-full py-12">
            <p className="text-muted-foreground">
              {t("noStages")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
