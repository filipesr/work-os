"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

type Option = { id: string; name: string };

const QUICK_FILTERS = ["pending", "overdue", "completed", "week"] as const;
const STATUSES = ["BACKLOG", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"] as const;
const PRIORITIES = [
  { value: "URGENT", key: "urgent" },
  { value: "HIGH", key: "high" },
  { value: "MEDIUM", key: "medium" },
  { value: "LOW", key: "low" },
] as const;
const SORTS = ["recent", "dueDate", "priority"] as const;

const FILTER_KEYS = ["quick", "status", "priority", "assignment", "client", "team", "sort"];

const selectClass =
  "h-8 rounded-md border border-border bg-transparent pl-2.5 pr-1 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 focus-visible:outline-none focus-visible:border-primary focus-visible:text-foreground transition-colors";

export function TaskFilters({ clients, teams }: { clients: Option[]; teams: Option[] }) {
  const t = useTranslations("admin.tasks.list");
  const { searchParams, setParam, clearParams } = useUrlFilters();

  const current = (key: string) => searchParams.get(key) ?? "";

  const clearAll = () => clearParams([...FILTER_KEYS, "page"]);

  const quick = current("quick");
  const hasActiveFilters = FILTER_KEYS.some((key) => current(key) !== "");

  return (
    <div className="mb-6 space-y-2.5">
      {/* Quick chips + sort */}
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_FILTERS.map((q) => {
          const active = quick === q;
          return (
            <button
              key={q}
              type="button"
              onClick={() => setParam("quick", active ? null : q)}
              aria-pressed={active}
              className={`px-2.5 py-1 text-sm rounded-full transition-colors ${
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t(`filters.quick.${q}`)}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1.5">
          <label htmlFor="task-sort" className="text-sm text-muted-foreground">
            {t("filters.sort.label")}
          </label>
          <select
            id="task-sort"
            value={current("sort") || "recent"}
            onChange={(e) => setParam("sort", e.target.value === "recent" ? null : e.target.value)}
            className={selectClass}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {t(`filters.sort.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("filters.status.label")}
          value={current("status")}
          onChange={(e) => setParam("status", e.target.value || null)}
          className={selectClass}
        >
          <option value="">{t("filters.status.all")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`taskStatus.${s}`)}
            </option>
          ))}
        </select>

        <select
          aria-label={t("filters.priority.label")}
          value={current("priority")}
          onChange={(e) => setParam("priority", e.target.value || null)}
          className={selectClass}
        >
          <option value="">{t("filters.priority.all")}</option>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {t(`priority.${p.key}`)}
            </option>
          ))}
        </select>

        <select
          aria-label={t("filters.assignment.label")}
          value={current("assignment")}
          onChange={(e) => setParam("assignment", e.target.value || null)}
          className={selectClass}
        >
          <option value="">{t("filters.assignment.all")}</option>
          <option value="assigned">{t("filters.assignment.assigned")}</option>
          <option value="unassigned">{t("filters.assignment.unassigned")}</option>
        </select>

        <select
          aria-label={t("filters.client.label")}
          value={current("client")}
          onChange={(e) => setParam("client", e.target.value || null)}
          className={selectClass}
        >
          <option value="">{t("filters.client.all")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          aria-label={t("filters.team.label")}
          value={current("team")}
          onChange={(e) => setParam("team", e.target.value || null)}
          className={selectClass}
        >
          <option value="">{t("filters.team.all")}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            {t("filters.clearAll")}
          </button>
        )}
      </div>
    </div>
  );
}
