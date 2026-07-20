"use client";

import { Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/actions/client";
import { useCreateEntityForm } from "@/lib/hooks/useCreateEntityForm";
import { QuickCreateDialog } from "./QuickCreateDialog";

interface QuickCreateClientProps {
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  size?: "default" | "sm" | "lg";
  className?: string;
  onClientCreated?: (clientId: string) => void;
}

export function QuickCreateClient({
  variant = "outline",
  size = "sm",
  className,
  onClientCreated,
}: QuickCreateClientProps) {
  const t = useTranslations("quickCreate.client");
  const { open, setOpen, isPending, formData, setFormData, handleSubmit } = useCreateEntityForm({
    action: createClient,
    initialFormData: { name: "", description: "", email: "", phone: "" },
    extractEntity: (result) => result.client,
    successMessage: (client) => t("successMessage", { name: client.name }),
    nameRequiredMessage: t("errorRequired"),
    onCreated: onClientCreated,
  });

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
      icon={<Building2 className="h-5 w-5" />}
      title={t("title")}
      description={t("description")}
      cancelLabel={t("cancel")}
      createLabel={t("create")}
      creatingLabel={t("creating")}
    >
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

      {/* Email */}
      <div className="grid gap-2">
        <Label htmlFor="email">{t("emailLabel")}</Label>
        <Input
          id="email"
          type="email"
          placeholder={t("emailPlaceholder")}
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          disabled={isPending}
        />
      </div>

      {/* Phone */}
      <div className="grid gap-2">
        <Label htmlFor="phone">{t("phoneLabel")}</Label>
        <Input
          id="phone"
          placeholder={t("phonePlaceholder")}
          value={formData.phone}
          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          disabled={isPending}
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
