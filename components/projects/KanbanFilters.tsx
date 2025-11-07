"use client";

import { User, TaskPriority } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

export type FilterState = {
  myTasks: boolean;
  byTeam: boolean;
  assigneeId: string | null;
  priority: TaskPriority | null;
};

interface KanbanFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  assignees: Pick<User, "id" | "name" | "email">[];
  hasTeam: boolean;
}

export function KanbanFilters({
  filters,
  onFiltersChange,
  assignees,
  hasTeam,
}: KanbanFiltersProps) {
  const t = useTranslations("projects");

  const priorityOptions = [
    { value: "LOW", label: t("priority.LOW") },
    { value: "MEDIUM", label: t("priority.MEDIUM") },
    { value: "HIGH", label: t("priority.HIGH") },
    { value: "URGENT", label: t("priority.URGENT") },
  ];
  const activeFilterCount =
    (filters.myTasks ? 1 : 0) +
    (filters.byTeam ? 1 : 0) +
    (filters.assigneeId ? 1 : 0) +
    (filters.priority ? 1 : 0);

  const clearAllFilters = () => {
    onFiltersChange({
      myTasks: false,
      byTeam: false,
      assigneeId: null,
      priority: null,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-card rounded-lg border">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{t("filters.title")}</span>
        {activeFilterCount > 0 && (
          <Badge variant="secondary">{activeFilterCount}</Badge>
        )}
      </div>

      {/* My Tasks Toggle */}
      <Button
        variant={filters.myTasks ? "default" : "outline"}
        size="sm"
        onClick={() =>
          onFiltersChange({ ...filters, myTasks: !filters.myTasks })
        }
      >
        {t("filters.myTasks")}
      </Button>

      {/* By Team Toggle (only if user has a team) */}
      {hasTeam && (
        <Button
          variant={filters.byTeam ? "default" : "outline"}
          size="sm"
          onClick={() =>
            onFiltersChange({ ...filters, byTeam: !filters.byTeam })
          }
        >
          {t("filters.myTeam")}
        </Button>
      )}

      {/* Assignee Filter */}
      <Select
        value={filters.assigneeId || "all"}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            assigneeId: value === "all" ? null : value,
          })
        }
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t("filters.byAssignee")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("filters.allAssignees")}</SelectItem>
          {assignees.map((assignee) => (
            <SelectItem key={assignee.id} value={assignee.id}>
              {assignee.name || assignee.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Priority Filter */}
      <Select
        value={filters.priority || "all"}
        onValueChange={(value) =>
          onFiltersChange({
            ...filters,
            priority: value === "all" ? null : (value as TaskPriority),
          })
        }
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder={t("filters.byPriority")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("filters.allPriorities")}</SelectItem>
          {priorityOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Clear All Filters */}
      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="ml-auto"
        >
          <X className="h-4 w-4 mr-1" />
          {t("filters.clearFilters")}
        </Button>
      )}
    </div>
  );
}
