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
    dependsOn: { id: string; name: string; order: number };
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
      <div className="text-center text-muted-foreground py-8">
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
          <div key={stage.id} className="border-2 border-border rounded-lg p-4 bg-card shadow-sm">
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
                      className="block text-sm font-semibold text-foreground mb-2"
                    >
                      Stage Name *
                    </label>
                    <input
                      type="text"
                      id={`edit-name-${stage.id}`}
                      name="name"
                      required
                      defaultValue={stage.name}
                      className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-order-${stage.id}`}
                      className="block text-sm font-semibold text-foreground mb-2"
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
                      className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`edit-team-${stage.id}`}
                      className="block text-sm font-semibold text-foreground mb-2"
                    >
                      Default Team
                    </label>
                    <select
                      id={`edit-team-${stage.id}`}
                      name="defaultTeamId"
                      defaultValue={stage.defaultTeamId || ""}
                      className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
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
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingStageId(null)}
                    className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-all"
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
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                        {stage.order}
                      </span>
                      <h3 className="text-lg font-bold text-foreground">{stage.name}</h3>
                    </div>
                    <div className="ml-11 space-y-1 text-sm text-muted-foreground">
                      <p>
                        <span className="font-medium">Default Team:</span>{" "}
                        {stage.defaultTeam?.name || "None"}
                      </p>
                      {stage.dependencies.length > 0 && (
                        <p>
                          <span className="font-medium">Dependencies:</span>{" "}
                          {stage.dependencies
                            .map((dep) => dep.dependsOn.name)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => setManagingDepsStageId(stage.id)}
                      className="px-4 py-2 text-sm font-semibold bg-accent text-accent-foreground rounded-lg hover:bg-accent/80 transition-all shadow-sm"
                    >
                      Dependencies
                    </button>
                    <button
                      onClick={() => setEditingStageId(stage.id)}
                      className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingStageId(stage.id)}
                      className="px-4 py-2 text-sm font-semibold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-all shadow-sm"
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
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-card border-2 border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
                  <h3 className="text-xl font-bold text-foreground mb-4">Delete Stage?</h3>
                  <p className="text-muted-foreground mb-6">
                    Are you sure you want to delete the stage "{stage.name}"? This will
                    also delete all dependencies. This action cannot be undone.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setDeletingStageId(null)}
                      className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-all"
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
                        className="px-5 py-2.5 bg-destructive text-destructive-foreground font-semibold rounded-lg hover:bg-destructive/90 transition-all shadow-sm"
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
