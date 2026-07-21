"use client";

import { useState } from "react";
import { updateWorkflowTemplate, deleteWorkflowTemplate } from "@/lib/actions/template";
import { useTranslations } from "next-intl";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface TemplateHeaderProps {
  template: {
    id: string;
    name: string;
    description: string | null;
  };
}

export function TemplateHeader({ template }: TemplateHeaderProps) {
  const t = useTranslations("template.header");
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
