"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addLinkArtifact } from "@/lib/actions/task";
import { Link2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { ArtifactType } from "@prisma/client";
import { useTranslations } from "next-intl";

interface AddArtifactFormProps {
  taskId: string;
  userId: string;
}

export function AddArtifactForm({ taskId, userId }: AddArtifactFormProps) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ArtifactType>("OTHER");
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("tasks.artifacts");

  const artifactTypeOptions = [
    { value: "DOCUMENT", label: t("types.document") },
    { value: "IMAGE", label: t("types.image") },
    { value: "VIDEO", label: t("types.video") },
    { value: "FIGMA", label: "Figma" },
    { value: "OTHER", label: t("types.other") },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !url.trim()) {
      toast.error(t("requiredFields"));
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      toast.error(t("invalidUrl"));
      return;
    }

    startTransition(async () => {
      const result = await addLinkArtifact(taskId, title, url, type);

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(t("addSuccess"));
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
        <h3 className="font-medium text-sm">{t("addArtifact")}</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="artifact-title" className="text-sm">
            {t("name")}
          </Label>
          <Input
            id="artifact-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("namePlaceholder")}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="artifact-type" className="text-sm">
            {t("type")}
          </Label>
          <select
            id="artifact-type"
            value={type}
            onChange={(e) => setType(e.target.value as ArtifactType)}
            disabled={isPending}
            className="flex h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
          >
            {artifactTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="artifact-url" className="text-sm">
          {t("url")}
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
        {isPending ? t("adding") : t("submitButton")}
      </Button>
    </form>
  );
}
