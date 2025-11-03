"use client";

import { useState } from "react";
import { updateTemplateStage, deleteTemplateStage } from "@/lib/actions/stage";
import { DependencyManager } from "./DependencyManager";

interface Stage {
  id: string;
  name: string;
  order: number;
  defaultTeamId: string | null;
  defaultTeam: { id: string; name: string } | null;
  dependencies: Array<{
    dependsOnStageId: string;
    dependsOnStage: { id: string; name: string; order: number };
  }>;
}

interface StagesListProps {
  stages: Stage[];
  templateId: string;
  teams: Array<{ id: string; name: string }>;
}

export function StagesList({ stages, templateId, teams }: StagesListProps) {
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [managingDepsStageId, setManagingDepsStageId] = useState<string | null>(null);
  const [deletingStageId, setDeletingStageId] = useState<string | null>(null);

  if (stages.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        No stages yet. Create your first stage above.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stages.map((stage) => {
        const isEditing = editingStageId === stage.id;
        const isManagingDeps = managingDepsStageId === stage.id;

        return (
          <div key={stage.id} className="border border-gray-300 rounded-lg p-4 bg-white">
            {isEditing ? (
              // Edit Form
              <form
                action={async (formData: FormData) => {
                  const result = await updateTemplateStage(
                    stage.id,
                    templateId,
                    formData
                  );
                  if (result?.success) {
                    setEditingStageId(null);
                  }
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor={`edit-name-${stage.id}`}
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Stage Name *
                    </label>
                    <input
                      type="text"
                      id={`edit-name-${stage.id}`}
                      name="name"
                      required
                      defaultValue={stage.name}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-order-${stage.id}`}
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Order *
                    </label>
                    <input
                      type="number"
                      id={`edit-order-${stage.id}`}
                      name="order"
                      required
                      min="0"
                      defaultValue={stage.order}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-team-${stage.id}`}
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Default Team
                    </label>
                    <select
                      id={`edit-team-${stage.id}`}
                      name="defaultTeamId"
                      defaultValue={stage.defaultTeamId || ""}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">No default team</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingStageId(null)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              // Display Mode
              <>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-semibold text-sm">
                        {stage.order}
                      </span>
                      <h3 className="text-lg font-semibold">{stage.name}</h3>
                    </div>
                    <div className="ml-11 space-y-1 text-sm text-gray-600">
                      <p>
                        <span className="font-medium">Default Team:</span>{" "}
                        {stage.defaultTeam?.name || "None"}
                      </p>
                      {stage.dependencies.length > 0 && (
                        <p>
                          <span className="font-medium">Dependencies:</span>{" "}
                          {stage.dependencies
                            .map((dep) => dep.dependsOnStage.name)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => setManagingDepsStageId(stage.id)}
                      className="px-3 py-1 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                    >
                      Dependencies
                    </button>
                    <button
                      onClick={() => setEditingStageId(stage.id)}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingStageId(stage.id)}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Dependency Manager Modal */}
                {isManagingDeps && (
                  <DependencyManager
                    stageId={stage.id}
                    stageName={stage.name}
                    templateId={templateId}
                    allStages={stages}
                    currentDependencies={stage.dependencies.map(
                      (d) => d.dependsOnStageId
                    )}
                    onClose={() => setManagingDepsStageId(null)}
                  />
                )}
              </>
            )}

            {/* Delete Confirmation Modal */}
            {deletingStageId === stage.id && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                  <h3 className="text-xl font-semibold mb-4">Delete Stage?</h3>
                  <p className="text-gray-600 mb-6">
                    Are you sure you want to delete the stage "{stage.name}"? This will
                    also delete all dependencies. This action cannot be undone.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setDeletingStageId(null)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <form
                      action={async () => {
                        const result = await deleteTemplateStage(stage.id, templateId);
                        if (result?.success) {
                          setDeletingStageId(null);
                        }
                      }}
                    >
                      <button
                        type="submit"
                        className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                      >
                        Delete Stage
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
