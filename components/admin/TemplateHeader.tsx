"use client";

import { useState } from "react";
import { updateWorkflowTemplate, deleteWorkflowTemplate } from "@/lib/actions/template";
import { useTranslations } from "next-intl";

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
  const [isDeleting, setIsDeleting] = useState(false);

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
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={template.name}
              className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
            />
          </div>
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-semibold text-foreground mb-2"
            >
              {t("descriptionLabel")}
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={template.description || ""}
              className="w-full rounded-lg border-2 border-input-border bg-input px-4 py-3 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all resize-none"
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
          <button
            onClick={() => setIsDeleting(true)}
            className="px-5 py-2.5 bg-destructive text-destructive-foreground font-semibold rounded-lg hover:bg-destructive/90 transition-all shadow-sm"
          >
            {t("deleteButton")}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleting && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border-2 border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
            <h3 className="text-xl font-bold text-foreground mb-4">{t("deleteConfirmTitle")}</h3>
            <p className="text-muted-foreground mb-6">
              {t("deleteConfirmMessage")}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setIsDeleting(false)}
                className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-all"
              >
                {t("cancel")}
              </button>
              <form action={deleteWorkflowTemplate.bind(null, template.id)}>
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
}
