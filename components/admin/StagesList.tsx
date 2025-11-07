"use client";

import { useState, useEffect } from "react";
import { updateTemplateStage, deleteTemplateStage } from "@/lib/actions/stage";
import { DependencySelector } from "./DependencySelector";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

interface Stage {
  id: string;
  name: string;
  order: number;
  defaultTeamId: string | null;
  defaultTeam: { id: string; name: string } | null;
  dependencies: Array<{
    id: string;
    stageId: string;
    stage: { id: string; name: string; order: number };
    dependsOnStageId: string;
    dependsOn: { id: string; name: string; order: number };
  }>;
  dependents: Array<{
    id: string;
    stageId: string;
    stage: { id: string; name: string; order: number };
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
  const t = useTranslations("template.stagesList");
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [deletingStageId, setDeletingStageId] = useState<string | null>(null);
  const [editingDeps, setEditingDeps] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggleDep = (stageId: string) => {
    const newSelected = new Set(editingDeps);
    const action = newSelected.has(stageId) ? 'remove' : 'add';

    if (newSelected.has(stageId)) {
      newSelected.delete(stageId);
    } else {
      newSelected.add(stageId);
    }

    console.log(`[TOGGLE DEP] ${action} stage ${stageId}, new deps:`, Array.from(newSelected));
    setEditingDeps(newSelected);
  };

  // Effect to initialize editing dependencies when entering edit mode
  useEffect(() => {
    if (editingStageId) {
      const stage = stages.find(s => s.id === editingStageId);
      if (stage) {
        const deps = stage.dependents.map(d => d.dependsOnStageId);
        console.log('[EDIT MODE] Loading dependencies for stage:', stage.name);
        console.log('[EDIT MODE] Current dependencies:', stage.dependents.map(d => d.dependsOn.name).join(', '));
        console.log('[EDIT MODE] Dependency IDs:', deps);
        setEditingDeps(new Set(deps));
      }
    } else {
      // Clear deps when not editing
      console.log('[EDIT MODE] Clearing dependencies');
      setEditingDeps(new Set());
    }
  }, [editingStageId, stages]);

  if (stages.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stages.map((stage) => {
        const isEditing = editingStageId === stage.id;

        return (
          <div key={stage.id} className="border-2 border-border rounded-lg p-4 bg-card shadow-sm">
            {isEditing ? (
              // Edit Form
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setIsSubmitting(true);

                  const formData = new FormData(e.currentTarget);

                  // Add selected dependencies to form data
                  editingDeps.forEach(depId => {
                    formData.append('dependencies[]', depId);
                  });

                  console.log('Updating stage', stage.id, 'with dependencies:', Array.from(editingDeps));

                  const result = await updateTemplateStage(
                    stage.id,
                    templateId,
                    formData
                  );

                  setIsSubmitting(false);

                  if (result?.success) {
                    toast.success(t("successMessage"));
                    setEditingStageId(null);
                    setEditingDeps(new Set());
                  } else {
                    toast.error(result?.error || t("errorMessage"));
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
                      {t("nameLabel")}
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
                      {t("orderLabel")}
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
                      {t("teamLabel")}
                    </label>
                    <select
                      id={`edit-team-${stage.id}`}
                      name="defaultTeamId"
                      defaultValue={stage.defaultTeamId || ""}
                      className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
                    >
                      <option value="">{t("noTeam")}</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Dependencies Section in Edit Form */}
                <DependencySelector
                  stages={stages}
                  selectedDeps={editingDeps}
                  onToggle={handleToggleDep}
                  currentStageId={stage.id}
                />

                <div className="flex gap-3 pt-4 border-t border-border">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? t("saving") : t("save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStageId(null);
                      setEditingDeps(new Set());
                    }}
                    disabled={isSubmitting}
                    className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-all disabled:opacity-50"
                  >
                    {t("cancel")}
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
                    <div className="ml-11 space-y-1">
                      <p className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{t("team")}</span>{" "}
                        {stage.defaultTeam?.name || t("noTeamAssigned")}
                      </p>
                      {stage.dependents.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-semibold text-foreground">{t("dependsOn")}</span>{" "}
                          {stage.dependents
                            .map((dep) => dep.dependsOn.name)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex gap-2">
                    <button
                      onClick={() => setEditingStageId(stage.id)}
                      className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-sm"
                    >
                      {t("editButton")}
                    </button>
                    <button
                      onClick={() => setDeletingStageId(stage.id)}
                      className="px-4 py-2 text-sm font-semibold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-all shadow-sm"
                    >
                      {t("deleteButton")}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Delete Confirmation Modal */}
            {deletingStageId === stage.id && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-card border-2 border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
                  <h3 className="text-xl font-bold text-foreground mb-4">{t("deleteConfirmTitle")}</h3>
                  <p className="text-muted-foreground mb-6">
                    {t("deleteConfirmMessage", { stageName: stage.name })}
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setDeletingStageId(null)}
                      className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-all"
                    >
                      {t("cancel")}
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
                        {t("deleteConfirmButton")}
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
