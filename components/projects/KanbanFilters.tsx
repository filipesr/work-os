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

const priorityOptions = [
  { value: "LOW", label: "Baixa" },
  { value: "MEDIUM", label: "Média" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
];

export function KanbanFilters({
  filters,
  onFiltersChange,
  assignees,
  hasTeam,
}: KanbanFiltersProps) {
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
        <span className="text-sm font-medium">Filtros:</span>
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
        Minhas Tarefas
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
          Meu Time
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
          <SelectValue placeholder="Por responsável" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os responsáveis</SelectItem>
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
          <SelectValue placeholder="Por prioridade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as prioridades</SelectItem>
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
          Limpar filtros
        </Button>
      )}
    </div>
  );
}
