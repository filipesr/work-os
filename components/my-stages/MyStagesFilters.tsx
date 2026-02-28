"use client";

import { useTranslations } from "next-intl";
import { ActiveStageStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface MyStagesFiltersProps {
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
  status,
  startDate,
  endDate,
  onStatusChange,
  onStartDateChange,
  onEndDateChange,
  onClearAll,
}: MyStagesFiltersProps) {
  const t = useTranslations("myStages");

  const hasActiveFilters = status !== null || startDate !== "" || endDate !== "";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Status Toggle Buttons */}
      <div className="flex items-center gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onStatusChange(status === s ? null : s)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md border transition-colors ${
              status === s
                ? s === "ACTIVE"
                  ? "bg-blue-100 text-blue-800 border-blue-300"
                  : s === "BLOCKED"
                  ? "bg-gray-100 text-gray-800 border-gray-300"
                  : "bg-green-100 text-green-800 border-green-300"
                : "bg-background text-muted-foreground border-border hover:bg-muted/50"
            }`}
          >
            {t(`filters.status.${s}`)}
          </button>
        ))}
      </div>

      {/* Date Filters */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">{t("filters.from")}</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="px-2 py-1.5 text-sm border border-border rounded-md bg-background"
        />
        <label className="text-sm text-muted-foreground">{t("filters.to")}</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
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
