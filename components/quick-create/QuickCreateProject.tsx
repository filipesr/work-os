"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban } from "lucide-react";
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
  variant?: "default" | "outline" | "ghost" | "link";
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
      toast.error("Nome do projeto é obrigatório");
      return;
    }

    if (!formData.clientId) {
      toast.error("Selecione um cliente");
      return;
    }

    startTransition(async () => {
      const result = await createProject(formData);

      if (result.error) {
        toast.error(result.error);
      } else if (result.project) {
        toast.success(`Projeto "${result.project.name}" criado com sucesso!`);
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
          Novo Projeto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              Criar Novo Projeto
            </DialogTitle>
            <DialogDescription>
              Adicione um novo projeto rapidamente. Você poderá editar mais detalhes depois.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Client Selection */}
            <div className="grid gap-2">
              <Label htmlFor="client">
                Cliente <span className="text-destructive">*</span>
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
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.length === 0 ? (
                      <div className="text-sm text-muted-foreground p-2 text-center">
                        Nenhum cliente cadastrado
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
                Nome do Projeto <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Ex: Website Institucional"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={isPending}
                required
              />
            </div>

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                placeholder="Informações adicionais sobre o projeto..."
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
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !formData.clientId}>
              {isPending ? "Criando..." : "Criar Projeto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
