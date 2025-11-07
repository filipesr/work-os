"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import toast from "react-hot-toast";
import { createProject } from "@/lib/actions/project";
import { QuickCreateClient } from "./QuickCreateClient";

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
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    clientId: "",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error(t("errorNameRequired"));
      return;
    }

    if (!formData.clientId) {
      toast.error(t("errorClientRequired"));
      return;
    }

    startTransition(async () => {
      const result = await createProject(formData);

      if (result.error) {
        toast.error(result.error);
      } else if (result.project) {
        toast.success(t("successMessage", { name: result.project.name }));
        setOpen(false);
        setFormData({ name: "", description: "", clientId: "" });

        if (onProjectCreated) {
          onProjectCreated(result.project.id);
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
              <FolderKanban className="h-5 w-5" />
              {t("title")}
            </DialogTitle>
            <DialogDescription>
              {t("description")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Client Selection */}
            <div className="grid gap-2">
              <Label htmlFor="client">
                {t("clientLabel")} <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Select
                  value={formData.clientId}
                  onValueChange={(value) =>
                    setFormData({ ...formData, clientId: value })
                  }
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
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
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
            <Button type="submit" disabled={isPending || !formData.clientId}>
              {isPending ? t("creating") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
