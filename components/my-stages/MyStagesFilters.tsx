"use client";

import { useTranslations } from "next-intl";
import { ActiveStageStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { stageStatusBadgeClass } from "@/lib/status-styles";

interface MyStagesFiltersProps {
  onlyMine: boolean;
  onOwnershipChange: (onlyMine: boolean) => void;
  status: ActiveStageStatus | null;
  startDate: string;
  endDate: string;
  onStatusChange: (status: ActiveStageStatus | null) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onClearAll: () => void;
}

const STATUS_OPTIONS: ActiveStageStatus[] = ["ACTIVE", "BLOCKED", "COMPLETED"];

export function MyStagesFilters({
  onlyMine,
  onOwnershipChange,
  status,
  startDate,
  endDate,
  onStatusChange,
  onStartDateChange,
  onEndDateChange,
  onClearAll,
}: MyStagesFiltersProps) {
  const t = useTranslations("myStages");

  const hasActiveFilters = !onlyMine || status !== null || startDate !== "" || endDate !== "";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Ownership Toggle */}
      <div className="flex items-center gap-2" role="group" aria-label={t("filters.title")}>
        <button
          onClick={() => onOwnershipChange(true)}
          aria-pressed={onlyMine}
          className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
            onlyMine
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted/50"
          }`}
        >
          {t("filters.ownership.mine")}
        </button>
        <button
          onClick={() => onOwnershipChange(false)}
          aria-pressed={!onlyMine}
          className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
            !onlyMine
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:bg-muted/50"
          }`}
        >
          {t("filters.ownership.all")}
        </button>
      </div>

      {/* Separator */}
      <div className="h-6 border-l border-border" />

      {/* Status Toggle Buttons */}
      <div className="flex items-center gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(status === s ? null : s)}
            aria-pressed={status === s}
            className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
              status === s
                ? stageStatusBadgeClass(s)
                : "bg-background text-muted-foreground border-border hover:bg-muted/50"
            }`}
          >
            {t(`filters.status.${s}`)}
          </button>
        ))}
      </div>

      {/* Date Filters */}
      <div className="flex items-center gap-2">
        <label htmlFor="filter-start-date" className="text-sm text-muted-foreground">
          {t("filters.from")}
        </label>
        <input
          id="filter-start-date"
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          aria-label={t("filters.from")}
          className="px-2 py-1.5 text-sm border border-border rounded-md bg-background"
        />
        <label htmlFor="filter-end-date" className="text-sm text-muted-foreground">
          {t("filters.to")}
        </label>
        <input
          id="filter-end-date"
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          aria-label={t("filters.to")}
          className="px-2 py-1.5 text-sm border border-border rounded-md bg-background"
        />
      </div>

      {/* Clear All */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={onClearAll} className="text-muted-foreground">
          <X className="h-4 w-4 mr-1" />
          {t("filters.clearAll")}
        </Button>
      )}
    </div>
  );
}
