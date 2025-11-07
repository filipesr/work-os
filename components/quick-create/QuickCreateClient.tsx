"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Building2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import toast from "react-hot-toast";
import { createClient } from "@/lib/actions/client";

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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    email: "",
    phone: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error(t("errorRequired"));
      return;
    }

    startTransition(async () => {
      const result = await createClient(formData);

      if (result.error) {
        toast.error(result.error);
      } else if (result.client) {
        toast.success(t("successMessage", { name: result.client.name }));
        setOpen(false);
        setFormData({ name: "", description: "", email: "", phone: "" });

        if (onClientCreated) {
          onClientCreated(result.client.id);
        } else {
          router.refresh();
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <Plus className="h-4 w-4 mr-2" />
          {t("buttonLabel")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {t("title")}
            </DialogTitle>
            <DialogDescription>
              {t("description")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
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
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
