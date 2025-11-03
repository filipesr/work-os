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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <h3 className="text-xl font-semibold mb-2">
          Manage Dependencies: {stageName}
        </h3>
        <p className="text-gray-600 mb-6 text-sm">
          Select which stages must be completed before "{stageName}" can start. These
          are the prerequisites for this stage.
        </p>

        {availableStages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No other stages available to set as dependencies.
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {availableStages.map((stage) => {
              const isSelected = selectedDeps.has(stage.id);
              return (
                <label
                  key={stage.id}
                  className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-purple-50 border-purple-300"
                      : "bg-white border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(stage.id)}
                    className="w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-500"
                  />
                  <div className="ml-3 flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 font-semibold text-xs">
                      {stage.order}
                    </span>
                    <span className="font-medium">{stage.name}</span>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Dependencies"}
          </button>
        </div>

        {selectedDeps.size > 0 && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              <span className="font-medium">Note:</span> "{stageName}" will only become
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
