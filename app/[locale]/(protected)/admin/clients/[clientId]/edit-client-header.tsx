"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";

interface EditClientHeaderProps {
  client: {
    id: string;
    name: string;
    description: string | null;
    email: string | null;
    phone: string | null;
    folderName: string | null;
  };
  /** true once a NAS artifact exists under the client — folderName can no longer change. */
  folderNameLocked: boolean;
  updateClient: (formData: FormData) => Promise<void>;
  deleteClient: (formData: FormData) => Promise<void>;
}

export function EditClientHeader({
  client,
  folderNameLocked,
  updateClient,
  deleteClient,
}: EditClientHeaderProps) {
  const t = useTranslations("admin.clients.detail");
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
        <h2 className="text-xl font-bold text-foreground mb-4">{t("editTitle")}</h2>
        <form
          action={async (formData: FormData) => {
            await updateClient(formData);
            setIsEditing(false);
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={client.id} />
          <div>
            <label htmlFor="name" className="block text-sm font-semibold text-foreground mb-2">
              {t("nameLabel")}
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={client.name}
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
              defaultValue={client.description || ""}
              className="w-full rounded-lg border-2 border-input-border bg-input px-4 py-3 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all resize-none"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-2">
                {t("emailLabel")}
              </label>
              <input
                type="email"
                id="email"
                name="email"
                defaultValue={client.email || ""}
                className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
              />
            </div>
            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-foreground mb-2">
                {t("phoneLabel")}
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                defaultValue={client.phone || ""}
                className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="folderName"
              className="block text-sm font-semibold text-foreground mb-2"
            >
              {t("folderLabel")}
            </label>
            {folderNameLocked ? (
              <>
                <input type="hidden" name="folderName" value={client.folderName ?? ""} />
                <p className="h-11 flex items-center rounded-lg border-2 border-input-border bg-muted px-4 text-base font-medium text-muted-foreground">
                  {client.folderName || "—"}{" "}
                  <span className="ml-2 text-xs">{t("folderLocked")}</span>
                </p>
              </>
            ) : (
              <input
                type="text"
                id="folderName"
                name="folderName"
                defaultValue={client.folderName ?? ""}
                placeholder={t("folderPlaceholder")}
                className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all"
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">{t("folderHelp")}</p>
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
          <h1 className="text-3xl font-bold text-foreground mb-3">{client.name}</h1>
          <p className="text-muted-foreground text-base mb-2">
            {client.description || t("noDescription")}
          </p>
          {client.email && (
            <p className="text-sm text-muted-foreground">
              {t("emailLabel")}: {client.email}
            </p>
          )}
          {client.phone && (
            <p className="text-sm text-muted-foreground">
              {t("phoneLabel")}: {client.phone}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {t("folderLabel")}:{" "}
            {client.folderName || <span className="italic">{t("folderNotSet")}</span>}
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
            action={async () => {
              const formData = new FormData();
              formData.set("id", client.id);
              await deleteClient(formData);
            }}
            title={t("deleteConfirmTitle")}
            description={t("deleteConfirmMessage")}
            confirmLabel={t("deleteConfirmButton")}
            cancelLabel={t("cancel")}
            confirmVariant="destructive"
            onSuccess={() => router.push("/admin/clients")}
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
