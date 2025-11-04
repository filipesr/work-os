"use client";

import { useState } from "react";
import { updateStageDependencies } from "@/lib/actions/dependency";

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
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(
    new Set(currentDependencies)
  );
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSave = async () => {
    setIsSaving(true);
    const result = await updateStageDependencies(
      stageId,
      templateId,
      Array.from(selectedDeps)
    );

    if (result?.success) {
      onClose();
    }
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card border-2 border-border rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto shadow-lg">
        <h3 className="text-xl font-bold text-foreground mb-3">
          Manage Dependencies: {stageName}
        </h3>
        <p className="text-muted-foreground mb-6 text-base">
          Select which stages must be completed before "{stageName}" can start. These
          are the prerequisites for this stage.
        </p>

        {availableStages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No other stages available to set as dependencies.
          </div>
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
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 bg-accent text-accent-foreground font-semibold rounded-lg hover:bg-accent/80 transition-all disabled:opacity-50 shadow-sm"
          >
            {isSaving ? "Saving..." : "Save Dependencies"}
          </button>
        </div>

        {selectedDeps.size > 0 && (
          <div className="mt-4 p-4 bg-primary/5 border-2 border-primary/20 rounded-lg">
            <p className="text-sm text-foreground">
              <span className="font-bold">Note:</span> "{stageName}" will only become
              available after{" "}
              {selectedDeps.size === 1
                ? "1 stage is"
                : `${selectedDeps.size} stages are`}{" "}
              completed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
