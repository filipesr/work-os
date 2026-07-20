"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createProject } from "@/lib/actions/project";
import { useCreateEntityForm } from "@/lib/hooks/useCreateEntityForm";
import { QuickCreateClient } from "./QuickCreateClient";
import { QuickCreateDialog } from "./QuickCreateDialog";

interface Client {
  id: string;
  name: string;
}

interface QuickCreateProjectProps {
  clients: Client[];
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  size?: "default" | "sm" | "lg";
  className?: string;
  onProjectCreated?: (projectId: string) => void;
}

export function QuickCreateProject({
  clients: initialClients,
  variant = "outline",
  size = "sm",
  className,
  onProjectCreated,
}: QuickCreateProjectProps) {
  const t = useTranslations("quickCreate.project");
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const { open, setOpen, isPending, formData, setFormData, handleSubmit } = useCreateEntityForm({
    action: createProject,
    initialFormData: { name: "", description: "", clientId: "" },
    extractEntity: (result) => result.project,
    successMessage: (project) => t("successMessage", { name: project.name }),
    nameRequiredMessage: t("errorNameRequired"),
    validate: (data) => (!data.clientId ? t("errorClientRequired") : undefined),
    onCreated: onProjectCreated,
  });

  // Update clients list when initialClients changes
  useEffect(() => {
    setClients(initialClients);
  }, [initialClients]);

  const handleClientCreated = (clientId: string) => {
    // Refresh to get updated clients list
    router.refresh();
    // Auto-select the newly created client
    setFormData({ ...formData, clientId });
  };

  return (
    <QuickCreateDialog
      open={open}
      onOpenChange={setOpen}
      isPending={isPending}
      onSubmit={handleSubmit}
      variant={variant}
      size={size}
      className={className}
      buttonLabel={t("buttonLabel")}
      icon={<FolderKanban className="h-5 w-5" />}
      title={t("title")}
      description={t("description")}
      cancelLabel={t("cancel")}
      createLabel={t("create")}
      creatingLabel={t("creating")}
      submitDisabled={!formData.clientId}
    >
      {/* Client Selection */}
      <div className="grid gap-2">
        <Label htmlFor="client">
          {t("clientLabel")} <span className="text-destructive">*</span>
        </Label>
        <div className="flex gap-2">
          <Select
            value={formData.clientId}
            onValueChange={(value) => setFormData({ ...formData, clientId: value })}
            disabled={isPending}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder={t("clientPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {clients.length === 0 ? (
                <div className="text-sm text-muted-foreground p-2 text-center">
                  {t("noClients")}
                </div>
              ) : (
                clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <QuickCreateClient
            variant="outline"
            size="default"
            onClientCreated={handleClientCreated}
          />
        </div>
      </div>

      {/* Name */}
      <div className="grid gap-2">
        <Label htmlFor="name">
          {t("nameLabel")} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          placeholder={t("namePlaceholder")}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          disabled={isPending}
          required
        />
      </div>

      {/* Description */}
      <div className="grid gap-2">
        <Label htmlFor="description">{t("descriptionLabel")}</Label>
        <Textarea
          id="description"
          placeholder={t("descriptionPlaceholder")}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          disabled={isPending}
          rows={3}
        />
      </div>
    </QuickCreateDialog>
  );
}
