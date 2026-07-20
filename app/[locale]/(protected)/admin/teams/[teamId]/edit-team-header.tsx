"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";

interface EditTeamHeaderProps {
  team: {
    id: string;
    name: string;
  };
  updateTeam: (formData: FormData) => Promise<void>;
  deleteTeam: (formData: FormData) => Promise<void>;
}

export function EditTeamHeader({ team, updateTeam, deleteTeam }: EditTeamHeaderProps) {
  const t = useTranslations("admin.teams.detail");
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
        <h2 className="text-xl font-bold text-foreground mb-4">{t("editTitle")}</h2>
        <form
          action={async (formData: FormData) => {
            await updateTeam(formData);
            setIsEditing(false);
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={team.id} />
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-2">
              {t("nameLabel")}
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={team.name}
              className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
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
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-foreground mb-3">{team.name}</h1>
        </div>
        <div className="ml-4 flex gap-3">
          <button
            onClick={() => setIsEditing(true)}
            className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm"
          >
            {t("editButton")}
          </button>
          <ConfirmActionButton
            action={async () => {
              const formData = new FormData();
              formData.set("id", team.id);
              await deleteTeam(formData);
            }}
            title={t("deleteConfirmTitle")}
            description={t("deleteConfirmMessage")}
            confirmLabel={t("deleteConfirmButton")}
            cancelLabel={t("cancel")}
            confirmVariant="destructive"
            onSuccess={() => router.push("/admin/teams")}
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
