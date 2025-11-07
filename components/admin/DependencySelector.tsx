"use client";

import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

interface Stage {
  id: string;
  name: string;
  order: number;
}

interface DependencySelectorProps {
  stages: Stage[];
  selectedDeps: Set<string>;
  onToggle: (stageId: string) => void;
  currentStageId?: string; // To exclude current stage from selection
}

export function DependencySelector({
  stages,
  selectedDeps,
  onToggle,
  currentStageId,
}: DependencySelectorProps) {
  const t = useTranslations("template.dependencies");

  // Filter out current stage if provided
  const availableStages = currentStageId
    ? stages.filter(s => s.id !== currentStageId)
    : stages;

  // Debug: log when component renders
  console.log('[DEPENDENCY SELECTOR] Rendering with:', {
    totalStages: stages.length,
    availableStages: availableStages.length,
    selectedCount: selectedDeps.size,
    selectedIds: Array.from(selectedDeps),
    currentStageId
  });

  if (availableStages.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 border-2 border-dashed border-border rounded-lg">
        <p className="text-sm">{t("noStagesAvailable")}</p>
        <p className="text-xs mt-1">{t("createStagesFirst")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-3">
        <div>
          <label className="block text-sm font-semibold text-foreground">
            {t("title")}
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            {t("subtitle")}
          </p>
        </div>
        {selectedDeps.size > 0 && (
          <Badge variant="default" className="ml-2">
            {selectedDeps.size === 1
              ? t("selectedCount", { count: selectedDeps.size })
              : t("selectedCountPlural", { count: selectedDeps.size })
            }
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {availableStages.map((stage) => {
          const isSelected = selectedDeps.has(stage.id);

          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => onToggle(stage.id)}
              className={`relative p-4 rounded-lg border-2 transition-all duration-200 text-left group ${
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox visual */}
                <div
                  className={`flex-shrink-0 w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                    isSelected
                      ? "border-primary bg-primary"
                      : "border-muted-foreground/30 bg-background group-hover:border-primary/50"
                  }`}
                >
                  {isSelected && (
                    <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                  )}
                </div>

                {/* Stage info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex-shrink-0">
                      {stage.order}
                    </span>
                    <span
                      className={`font-semibold text-sm transition-colors ${
                        isSelected ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {stage.name}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {isSelected ? t("prerequisiteLabel") : t("clickToAdd")}
                  </p>
                </div>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Help text */}
      {selectedDeps.size > 0 && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-xs text-blue-700 dark:text-blue-300">
            <strong>{t("importantTitle")}</strong>{" "}
            {selectedDeps.size === 1 ? t("importantSingle") : t("importantMultiple")}
          </p>
        </div>
      )}

      {selectedDeps.size === 0 && (
        <div className="mt-4 p-3 bg-muted/50 border border-border rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>{t("noDepsTitle")}</strong> {t("noDepsMessage")}
          </p>
        </div>
      )}
    </div>
  );
}
