"use client";

import { useState } from "react";
import { updateTemplateStage } from "@/lib/actions/stage";
import { DependencySelector } from "./DependencySelector";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import type { Stage } from "@/lib/types/stages";

interface StageEditFormProps {
  stage: Stage;
  templateId: string;
  teams: Array<{ id: string; name: string }>;
  stages: Stage[];
  selectedDeps: Set<string>;
  onToggleDep: (stageId: string) => void;
  onClose: () => void;
}

export function StageEditForm({
  stage,
  templateId,
  teams,
  stages,
  selectedDeps,
  onToggleDep,
  onClose,
}: StageEditFormProps) {
  const t = useTranslations("template.stagesList");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        const formData = new FormData(e.currentTarget);

        // Add selected dependencies to form data
        selectedDeps.forEach((depId) => {
          formData.append("dependencies[]", depId);
        });

        const result = await updateTemplateStage(stage.id, templateId, formData);

        setIsSubmitting(false);

        if (result?.success) {
          toast.success(t("successMessage"));
          onClose();
        } else {
          toast.error(result?.error || t("errorMessage"));
        }
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
        <div>
          <label
            htmlFor={`edit-sla-${stage.id}`}
            className="block text-sm font-semibold text-foreground mb-2"
          >
            {t("slaLabel")}
          </label>
          <input
            type="number"
            id={`edit-sla-${stage.id}`}
            name="expectedDurationHours"
            min="0"
            defaultValue={stage.expectedDurationHours ?? ""}
            placeholder={t("slaPlaceholder")}
            className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <input
              type="checkbox"
              name="optional"
              defaultChecked={stage.optional}
              className="h-4 w-4"
            />
            Etapa opcional
          </label>
        </div>
      </div>

      {/* Dependencies Section in Edit Form */}
      <DependencySelector
        stages={stages}
        selectedDeps={selectedDeps}
        onToggle={onToggleDep}
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
          onClick={onClose}
          disabled={isSubmitting}
          className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-all disabled:opacity-50"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
