"use client";

import { useState, type TransitionStartFunction } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArtifactType } from "@prisma/client";
import { Link2, Loader2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { addLinkArtifact } from "@/lib/actions/task";
import { addScopedLinkArtifact } from "@/lib/actions/artifact";
import { UploadArtifactForm } from "@/components/tasks/UploadArtifactForm";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_OPTIONS: { value: ArtifactType; typeKey: string }[] = [
  { value: "DOCUMENT", typeKey: "document" },
  { value: "IMAGE", typeKey: "image" },
  { value: "VIDEO", typeKey: "video" },
  { value: "FIGMA", typeKey: "figma" },
  { value: "OTHER", typeKey: "other" },
];

interface AddArtifactFormProps {
  scope: "TASK" | "PROJECT" | "CLIENT";
  ownerIds: { taskId?: string; projectId?: string; clientId?: string };
  isPending: boolean;
  startTransition: TransitionStartFunction;
}

export function AddArtifactForm({
  scope,
  ownerIds,
  isPending,
  startTransition,
}: AddArtifactFormProps) {
  const t = useTranslations("tasks.artifacts");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ArtifactType>("OTHER");

  const handleAddLink = () => {
    if (!title.trim() || !url.trim()) return toast.error(t("requiredFields"));
    try {
      new URL(url);
    } catch {
      return toast.error(t("invalidUrl"));
    }
    startTransition(async () => {
      const res =
        scope === "TASK"
          ? await addLinkArtifact(ownerIds.taskId as string, title, url, type)
          : await addScopedLinkArtifact({
              scope,
              projectId: scope === "PROJECT" ? ownerIds.projectId : undefined,
              clientId: scope === "CLIENT" ? ownerIds.clientId : undefined,
              title,
              url,
              type,
            });
      if (res && "error" in res && res.error) {
        toast.error(res.error);
      } else {
        setTitle("");
        setUrl("");
        setType("OTHER");
        toast.success(t("addedSuccess"));
        router.refresh();
      }
    });
  };

  return (
    <div className="rounded-lg border-2 border-dashed border-border p-4">
      <div className="mb-3 inline-flex rounded-lg border border-border p-0.5">
        <button
          type="button"
          onClick={() => setMode("link")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
            mode === "link"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Link2 className="h-4 w-4" /> {t("addLinkTab")}
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
            mode === "upload"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Upload className="h-4 w-4" /> {t("uploadNasTab")}
        </button>
      </div>

      {mode === "upload" ? (
        <UploadArtifactForm
          scope={scope}
          taskId={ownerIds.taskId}
          projectId={ownerIds.projectId}
          clientId={ownerIds.clientId}
        />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titleInputPlaceholder")}
              disabled={isPending}
            />
            <Select
              value={type}
              onValueChange={(v) => setType(v as ArtifactType)}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(`types.${o.typeKey}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("urlPlaceholder")}
            disabled={isPending}
          />
          <button
            type="button"
            onClick={handleAddLink}
            disabled={isPending || !title.trim() || !url.trim()}
            className="inline-flex h-11 items-center rounded-lg bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tCommon("buttons.add")}
          </button>
        </div>
      )}
    </div>
  );
}
