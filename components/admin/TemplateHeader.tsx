"use client";

import { useState } from "react";
import { updateWorkflowTemplate, deleteWorkflowTemplate } from "@/lib/actions/template";
import { useTranslations } from "next-intl";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canEnableQuickEntry } from "@/lib/template-invariants";

interface TemplateHeaderProps {
  template: {
    id: string;
    name: string;
    description: string | null;
    quickEntry: boolean;
  };
  stageCount: number;
}

export function TemplateHeader({ template, stageCount }: TemplateHeaderProps) {
  const t = useTranslations("admin.workflows.header");
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <div className="bg-card border border-border shadow-sm rounded-lg p-6">
        <h2 className="text-xl font-bold text-foreground mb-4">{t("edit")}</h2>
        <form
          action={async (formData: FormData) => {
            const result = await updateWorkflowTemplate(template.id, formData);
            if (result?.success) {
              setIsEditing(false);
            }
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-2">
              {t("nameLabel")}
            </label>
            <Input type="text" id="name" name="name" required defaultValue={template.name} />
          </div>
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-semibold text-foreground mb-2"
            >
              {t("descriptionLabel")}
            </label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={template.description || ""}
            />
          </div>
          {/* A caixa fica DESABILITADA com o motivo ao lado quando o fluxo tem mais de uma etapa.
              Deixá-la clicável e recusar no envio ensinaria a regra do jeito pior: depois de
              preencher. Já marcada, ela continua clicável — desmarcar é a saída para o fluxo crescer. */}
          <div>
            <label className="flex items-start gap-2 text-sm font-semibold text-foreground">
              <input
                type="checkbox"
                name="quickEntry"
                defaultChecked={template.quickEntry}
                disabled={!template.quickEntry && !canEnableQuickEntry(stageCount)}
                className="mt-0.5 h-4 w-4 accent-primary disabled:opacity-40"
              />
              <span>
                {t("quickEntry.label")}
                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                  {!template.quickEntry && !canEnableQuickEntry(stageCount)
                    ? t("quickEntry.blockedByStages", { count: stageCount })
                    : t("quickEntry.help")}
                </span>
              </span>
            </label>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm"
            >
              {t("saveChanges")}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-all"
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border shadow-sm rounded-lg p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground mb-3">{template.name}</h1>
          <p className="text-muted-foreground text-base">
            {template.description || t("noDescription")}
          </p>
        </div>
        <div className="ml-4 flex gap-3">
          <button
            onClick={() => setIsEditing(true)}
            className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm"
          >
            {t("editButton")}
          </button>
          <ConfirmActionButton
            action={deleteWorkflowTemplate.bind(null, template.id)}
            title={t("deleteConfirmTitle")}
            description={t("deleteConfirmMessage")}
            confirmLabel={t("deleteConfirmButton")}
            cancelLabel={t("cancel")}
            confirmVariant="destructive"
            trigger={
              <button className="px-5 py-2.5 bg-destructive text-destructive-foreground font-semibold rounded-lg hover:bg-destructive/90 transition-all shadow-sm">
                {t("deleteButton")}
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}
