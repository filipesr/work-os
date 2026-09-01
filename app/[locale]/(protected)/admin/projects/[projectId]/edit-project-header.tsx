"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";

interface EditProjectHeaderProps {
  project: {
    id: string;
    name: string;
    description: string | null;
    clientId: string;
    clientName: string;
  };
  clients: { id: string; name: string }[];
  updateProject: (formData: FormData) => Promise<void>;
  deleteProject: (formData: FormData) => Promise<void>;
}

export function EditProjectHeader({
  project,
  clients,
  updateProject,
  deleteProject,
}: EditProjectHeaderProps) {
  const t = useTranslations("admin.projects.detail");
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <div className="bg-card shadow-lg rounded-xl border border-border p-6">
        <h2 className="text-xl font-bold text-foreground mb-4">{t("editTitle")}</h2>
        <form
          action={async (formData: FormData) => {
            await updateProject(formData);
            setIsEditing(false);
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={project.id} />
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-2">
              {t("nameLabel")}
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={project.name}
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
              defaultValue={project.description || ""}
              className="w-full rounded-lg border-2 border-input-border bg-input px-4 py-3 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all resize-none"
            />
          </div>
          <div>
            <label htmlFor="clientId" className="block text-sm font-semibold text-foreground mb-2">
              {t("clientLabel")}
            </label>
            <select
              id="clientId"
              name="clientId"
              required
              defaultValue={project.clientId}
              className="w-full rounded-lg border-2 border-input-border bg-input text-foreground shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 px-3 py-2 transition-colors"
            >
              <option value="">{t("selectClient")}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
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
    <div className="bg-card shadow-lg rounded-xl border border-border p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground mb-3">{project.name}</h1>
          <p className="text-muted-foreground text-base mb-2">
            {project.description || t("noDescription")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("client")}:{" "}
            <Link
              href={`/admin/clients/${project.clientId}`}
              className="text-primary hover:text-primary/80 font-semibold transition-colors"
            >
              {project.clientName}
            </Link>
          </p>
        </div>
        <div className="ml-4 flex gap-3">
          <Link
            href={`/projects/${project.id}`}
            className="px-5 py-2.5 bg-secondary text-secondary-foreground font-semibold rounded-lg hover:bg-secondary/80 transition-all"
          >
            {t("viewTimeline")}
          </Link>
          <button
            onClick={() => setIsEditing(true)}
            className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm"
          >
            {t("editButton")}
          </button>
          <ConfirmActionButton
            action={async () => {
              const formData = new FormData();
              formData.set("id", project.id);
              await deleteProject(formData);
            }}
            title={t("deleteConfirmTitle")}
            description={t("deleteConfirmMessage")}
            confirmLabel={t("deleteConfirmButton")}
            cancelLabel={t("cancel")}
            confirmVariant="destructive"
            onSuccess={() => router.push(`/admin/clients/${project.clientId}`)}
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
