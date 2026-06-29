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
import { parsePage } from "@/lib/pagination";

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
    <div className="container mx-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link
          href="/admin/tasks/new"
          className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-sm hover:shadow-md transition-all duration-200"
        >
          {t("createTask")}
        </Link>
      </div>

      {/* Filters */}
      <TaskFilters clients={clients} teams={teams} />

      {/* Tasks List */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
        {tasks.length === 0 ? (
          hasActiveFilters ? (
            <div className="p-12 text-center">
              <h3 className="text-lg font-bold text-foreground mb-2">{t("filters.noResults")}</h3>
              <p className="text-muted-foreground">{t("filters.noResultsMessage")}</p>
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="text-muted-foreground mb-6">
                <svg
                  className="mx-auto h-16 w-16"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-foreground mb-3">{t("noTasksYet")}</h3>
              <p className="text-muted-foreground mb-6">{t("noTasksMessage")}</p>
              <Link
                href="/admin/tasks/new"
                className="inline-flex items-center px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-sm hover:shadow-md transition-all duration-200"
              >
                {t("createFirstTask")}
              </Link>
            </div>
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
                    <span
                      className={`px-3 py-1 text-xs font-bold rounded-full ${
                        task.status === "COMPLETED"
                          ? "bg-green-100 text-green-800 border border-green-200"
                          : task.status === "IN_PROGRESS"
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : task.status === "PAUSED" || task.status === "CANCELLED"
                              ? "bg-destructive/10 text-destructive border border-destructive/20"
                              : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {t(`taskStatus.${task.status}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {task.currentStage?.name || t("noStage")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 text-xs font-bold rounded-full ${
                        task.priority === "URGENT"
                          ? "bg-red-100 text-red-800 border border-red-200"
                          : task.priority === "HIGH"
                            ? "bg-orange-100 text-orange-800 border border-orange-200"
                            : task.priority === "MEDIUM"
                              ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                              : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {task.priority === "URGENT"
                        ? t("priority.urgent")
                        : task.priority === "HIGH"
                          ? t("priority.high")
                          : task.priority === "MEDIUM"
                            ? t("priority.medium")
                            : task.priority === "LOW"
                              ? t("priority.low")
                              : task.priority}
                    </span>
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
