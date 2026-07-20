"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2 } from "lucide-react";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

interface Option {
  id: string;
  name: string;
}

interface CalendarFiltersBarProps {
  teams: Option[];
  projects: Option[];
  users: Option[];
  selected: {
    teamId?: string;
    projectId?: string;
    userId?: string;
    showCompleted: boolean;
  };
}

export function CalendarFiltersBar({ teams, projects, users, selected }: CalendarFiltersBarProps) {
  const t = useTranslations("reportsCalendar.filters");
  const { setParam, setParams } = useUrlFilters({ replace: true });

  const update = (key: string, value: string) => {
    // Changing the team also clears the (now-stale) user selection.
    if (key === "team") setParams({ team: value, user: null });
    else setParam(key, value);
  };

  const toggleCompleted = () => {
    setParam("showCompleted", selected.showCompleted ? null : "1");
  };

  const selectClass =
    "h-9 rounded-lg border-2 border-input-border bg-input px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 transition-colors";

  const toggleBtn = `inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
    selected.showCompleted
      ? "bg-primary border-primary text-primary-foreground shadow-inner"
      : "bg-card border-border text-muted-foreground hover:bg-accent"
  }`;

  return (
    <div className="flex items-center gap-3 flex-nowrap">
      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground font-medium">{t("team")}:</span>
        <select
          className={selectClass}
          value={selected.teamId ?? ""}
          onChange={(e) => update("team", e.target.value)}
          aria-label={t("team")}
        >
          <option value="">{t("allTeams")}</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground font-medium">{t("project")}:</span>
        <select
          className={selectClass}
          value={selected.projectId ?? ""}
          onChange={(e) => update("project", e.target.value)}
          aria-label={t("project")}
        >
          <option value="">{t("allProjects")}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground font-medium">{t("user")}:</span>
        <select
          className={selectClass}
          value={selected.userId ?? ""}
          onChange={(e) => update("user", e.target.value)}
          aria-label={t("user")}
        >
          <option value="">{t("allUsers")}</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={toggleCompleted}
        aria-pressed={selected.showCompleted}
        aria-label={t("showCompleted")}
        title={t("showCompleted")}
        className={toggleBtn}
      >
        <CheckCircle2 className="h-4 w-4" />
      </button>
    </div>
  );
}
