import type { Metadata } from "next";
import Link from "next/link";
import {
  getTasks,
  getTeamsForFilter,
  type TaskListFilters,
  type TaskListSort,
} from "@/lib/actions/task";
import { getClients } from "@/lib/actions/client";
import { getTranslations } from "next-intl/server";
import { Pagination } from "@/components/ui/pagination";
import { TaskFilters } from "@/components/tasks/TaskFilters";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { taskStatusTone, priorityTone } from "@/lib/status-tone";
import { parsePage } from "@/lib/pagination";
import { ClipboardList, Plus, SearchX } from "lucide-react";

export const metadata: Metadata = {
  title: "Demandas",
};

type SearchParams = { [key: string]: string | string[] | undefined };

function firstParam(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single && single.length > 0 ? single : undefined;
}

function formatDate(value: Date | string): string {
  const date = new Date(value);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

const STATUS_VALUES = ["BACKLOG", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"] as const;
const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const ASSIGNMENT_VALUES = ["assigned", "unassigned"] as const;
const QUICK_VALUES = ["pending", "overdue", "completed", "week"] as const;
const SORT_VALUES = ["recent", "dueDate", "priority"] as const;

function pick<T extends readonly string[]>(
  value: string | undefined,
  allowed: T
): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const t = await getTranslations("admin.tasks.list");
  const params = await searchParams;
  const page = parsePage(params.page);

  const filters: TaskListFilters = {
    status: pick(firstParam(params.status), STATUS_VALUES),
    priority: pick(firstParam(params.priority), PRIORITY_VALUES),
    assignment: pick(firstParam(params.assignment), ASSIGNMENT_VALUES),
    quick: pick(firstParam(params.quick), QUICK_VALUES),
    clientId: firstParam(params.client),
    teamId: firstParam(params.team),
  };
  const sort: TaskListSort = pick(firstParam(params.sort), SORT_VALUES) ?? "recent";
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const [{ items: tasks, total, totalPages, pageSize }, clients, teams] = await Promise.all([
    getTasks({ page, filters, sort }),
    getClients(),
    getTeamsForFilter(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Link
            href="/admin/tasks/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 hover:shadow-md"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("createTask")}
          </Link>
        }
      />

      {/* Filters */}
      <TaskFilters clients={clients} teams={teams} />

      {/* Tasks List */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {tasks.length === 0 ? (
          hasActiveFilters ? (
            <EmptyState
              icon={SearchX}
              title={t("filters.noResults")}
              description={t("filters.noResultsMessage")}
            />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title={t("noTasksYet")}
              description={t("noTasksMessage")}
              action={
                <Link
                  href="/admin/tasks/new"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:bg-primary/90 hover:shadow-md"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("createFirstTask")}
                </Link>
              }
            />
          )
        ) : (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("table.task")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("table.project")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("table.status")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("table.currentStage")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("table.priority")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("table.assignee")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("table.dueDate")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-accent transition-colors">
                  <td className="px-6 py-4">
                    <Link
                      href={`/admin/tasks/${task.id}`}
                      className="text-primary hover:text-primary/80 font-semibold transition-colors"
                    >
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {task.project.client.name} - {task.project.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge
                      tone={taskStatusTone(task.status)}
                      label={t(`taskStatus.${task.status}`)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {task.currentStage?.name || t("noStage")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge
                      tone={priorityTone(task.priority)}
                      label={t(`priority.${task.priority.toLowerCase()}`)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {task.assignee?.name || t("unassigned")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {task.dueDate ? formatDate(task.dueDate) : t("noDueDate")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination
          basePath="/admin/tasks"
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          params={params}
        />
      </div>
    </div>
  );
}
