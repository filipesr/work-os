"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { addLinkArtifact } from "@/lib/actions/task";
import { Link2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { ArtifactType } from "@prisma/client";

interface AddArtifactFormProps {
  taskId: string;
  userId: string;
}

const artifactTypeOptions = [
  { value: "DOCUMENT", label: "Documento" },
  { value: "IMAGE", label: "Imagem" },
  { value: "VIDEO", label: "Vídeo" },
  { value: "FIGMA", label: "Figma" },
  { value: "OTHER", label: "Outro" },
];

export function AddArtifactForm({ taskId, userId }: AddArtifactFormProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ArtifactType>("OTHER");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !url.trim()) {
      toast.error("Título e URL são obrigatórios");
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      toast.error("URL inválida");
      return;
    }

    startTransition(async () => {
      const result = await addLinkArtifact(taskId, title, url, type);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("O link foi adicionado com sucesso");
        // Clear the form
        setTitle("");
        setUrl("");
        setType("OTHER");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="h-4 w-4" />
        <h3 className="font-medium text-sm">Adicionar Link/Artefato</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="artifact-title" className="text-sm">
            Título
          </Label>
          <Input
            id="artifact-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Design Final - Figma"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="artifact-type" className="text-sm">
            Tipo
          </Label>
          <Select
            id="artifact-type"
            value={type}
            onChange={(e) => setType(e.target.value as ArtifactType)}
            disabled={isPending}
          >
            {artifactTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="artifact-url" className="text-sm">
          URL
        </Label>
        <Input
          id="artifact-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          disabled={isPending}
        />
      </div>

      <Button
        type="submit"
        disabled={isPending || !title.trim() || !url.trim()}
        size="sm"
      >
        {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {isPending ? "Adicionando..." : "Adicionar Link"}
      </Button>
    </form>
  );
}
