"use client";

import { useState } from "react";
import { createTemplateStage } from "@/lib/actions/stage";
import { DependencySelector } from "./DependencySelector";
import { Input } from "@/components/ui/input";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

interface Stage {
  id: string;
  name: string;
  order: number;
}

interface CreateStageFormProps {
  templateId: string;
  teams: Array<{ id: string; name: string }>;
  existingStages: Stage[];
}

export function CreateStageForm({ templateId, teams, existingStages }: CreateStageFormProps) {
  const t = useTranslations("admin.workflows.createStage");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedDeps, setSelectedDeps] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleToggleDep = (stageId: string) => {
    const newSelected = new Set(selectedDeps);
    if (newSelected.has(stageId)) {
      newSelected.delete(stageId);
    } else {
      newSelected.add(stageId);
    }
    setSelectedDeps(newSelected);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm"
      >
        {t("addButton")}
      </button>
    );
  }

  return (
    <div className="border border-border rounded-lg p-6 bg-muted/30">
      <h3 className="font-bold text-foreground text-lg mb-4">{t("title")}</h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setIsSubmitting(true);

          const formData = new FormData(e.currentTarget);

          selectedDeps.forEach((depId) => {
            formData.append("dependencies[]", depId);
          });

          const result = await createTemplateStage(templateId, formData);

          setIsSubmitting(false);

          if (result?.success) {
            toast.success(t("successMessage"));
            setIsOpen(false);
            setSelectedDeps(new Set());
          } else {
            toast.error(result?.error || t("errorMessage"));
          }
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-2">
              {t("nameLabel")}
            </label>
            <Input type="text" id="name" name="name" required placeholder={t("namePlaceholder")} />
          </div>
          <div>
            <label htmlFor="order" className="block text-sm font-semibold text-foreground mb-2">
              {t("orderLabel")}
            </label>
            <Input type="number" id="order" name="order" required min="0" defaultValue="0" />
          </div>
          <div>
            <label
              htmlFor="defaultTeamId"
              className="block text-sm font-semibold text-foreground mb-2"
            >
              {t("teamLabel")}
            </label>
            <select
              id="defaultTeamId"
              name="defaultTeamId"
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
              htmlFor="expectedDurationHours"
              className="block text-sm font-semibold text-foreground mb-2"
            >
              {t("slaLabel")}
            </label>
            <Input
              type="number"
              id="expectedDurationHours"
              name="expectedDurationHours"
              required
              min="1"
              placeholder={t("slaPlaceholder")}
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <input type="checkbox" name="optional" className="h-4 w-4" />
              {t("optional")}
            </label>
          </div>
        </div>

        {/* Dependencies Section */}
        <DependencySelector
          stages={existingStages}
          selectedDeps={selectedDeps}
          onToggle={handleToggleDep}
        />

        <div className="flex gap-3 pt-4 border-t border-border">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? t("creating") : t("create")}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setSelectedDeps(new Set());
            }}
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-all disabled:opacity-50"
          >
            {t("cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
