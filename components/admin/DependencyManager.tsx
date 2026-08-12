"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { updateStageDependencies } from "@/lib/actions/dependency";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useServerAction } from "@/lib/hooks/useServerAction";

interface DependencyManagerProps {
  stageId: string;
  stageName: string;
  templateId: string;
  allStages: Array<{ id: string; name: string; order: number }>;
  currentDependencies: string[]; // Array of dependsOnStageIds
  onClose: () => void;
}

export function DependencyManager({
  stageId,
  stageName,
  templateId,
  allStages,
  currentDependencies,
  onClose,
}: DependencyManagerProps) {
  const t = useTranslations("admin.workflows.dependencyManager");
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set(currentDependencies));

  // Filter out the current stage from available dependencies
  const availableStages = allStages.filter((stage) => stage.id !== stageId);

  const handleToggle = (stageIdToToggle: string) => {
    const newSelected = new Set(selectedDeps);
    if (newSelected.has(stageIdToToggle)) {
      newSelected.delete(stageIdToToggle);
    } else {
      newSelected.add(stageIdToToggle);
    }
    setSelectedDeps(newSelected);
  };

  const { run: handleSave, isPending: isSaving } = useServerAction(
    () => updateStageDependencies(stageId, templateId, Array.from(selectedDeps)),
    { onSuccess: onClose }
  );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title", { stageName })}</DialogTitle>
          <DialogDescription>{t("description", { stageName })}</DialogDescription>
        </DialogHeader>

        {availableStages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">{t("noStages")}</div>
        ) : (
          <div className="space-y-3 mb-6">
            {availableStages.map((stage) => {
              const isSelected = selectedDeps.has(stage.id);
              return (
                <label
                  key={stage.id}
                  className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? "bg-accent/20 border-accent"
                      : "bg-card border-border hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(stage.id)}
                    className="w-5 h-5 text-accent rounded focus:ring-2 focus:ring-accent/30"
                  />
                  <div className="ml-3 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {stage.order}
                    </span>
                    <span className="font-semibold text-foreground">{stage.name}</span>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-all disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            onClick={() => handleSave()}
            disabled={isSaving}
            className="px-5 py-2.5 bg-accent text-accent-foreground font-semibold rounded-lg hover:bg-accent/80 transition-all disabled:opacity-50 shadow-sm"
          >
            {isSaving ? t("saving") : t("save")}
          </button>
        </div>

        {selectedDeps.size > 0 && (
          <div className="mt-4 p-4 bg-primary/5 border-2 border-primary/20 rounded-lg">
            <p className="text-sm text-foreground">
              <span className="font-bold">{t("noteLabel")}</span>{" "}
              {selectedDeps.size === 1
                ? t("noteSingle", { stageName })
                : t("notePlural", { stageName, count: selectedDeps.size })}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
