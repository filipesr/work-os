"use client";

import { useState, type TransitionStartFunction } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Download, Link2, Loader2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import type { ArtifactMediaType, SensitivityLevel } from "@prisma/client";
import { addLinkArtifact } from "@/lib/actions/task";
import { addScopedLinkArtifact } from "@/lib/actions/artifact";
import { enqueueArtifactImport } from "@/lib/actions/artifact-import";
import { UploadArtifactForm } from "@/components/tasks/UploadArtifactForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// De `media-types`, NÃO de `path`: este é um componente "use client", e `lib/nas/path.ts` importa
// `node:crypto` — o webpack recusa isso no bundle do browser. `media-types.ts` é a metade pura.
import { LINK_ONLY_MEDIA_TYPES, UPLOADABLE_MEDIA_TYPES } from "@/lib/nas/media-types";

// A aba de LINK oferece os sete: link de Figma é justamente o que FIGMA existe para classificar.
// O que muda é o que se pode IMPORTAR — daí a lista dos só-de-link, logo abaixo.
const MEDIA_TYPES = [...UPLOADABLE_MEDIA_TYPES, ...LINK_ONLY_MEDIA_TYPES];
const SENSITIVITIES = ["INTERNO", "CLIENTE", "CONFIDENCIAL"];

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
  const tUpload = useTranslations("tasks.upload");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [mediaType, setMediaType] = useState("DOCUMENTOS");
  const [sensitivity, setSensitivity] = useState("INTERNO");

  const camposOk = Boolean(title.trim() && url.trim());
  // FIGMA e OUTROS existem só como link: importar não é uma opção, e a tela precisa dizer isso ANTES
  // do clique. Um botão que só recusa depois de apertado ensina que o sistema é aleatório.
  const soLink = (LINK_ONLY_MEDIA_TYPES as readonly string[]).includes(mediaType);

  const validarUrl = (): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      toast.error(t("invalidUrl"));
      return false;
    }
  };

  const finalizar = (res: { error?: string } | undefined, sucesso: string) => {
    if (res && "error" in res && res.error) return toast.error(res.error);
    setTitle("");
    setUrl("");
    setMediaType("DOCUMENTOS");
    setSensitivity("INTERNO");
    toast.success(sucesso);
    router.refresh();
  };

  const handleAddLink = () => {
    if (!camposOk) return toast.error(t("requiredFields"));
    if (!validarUrl()) return;
    startTransition(async () => {
      const res =
        scope === "TASK"
          ? await addLinkArtifact(
              ownerIds.taskId as string,
              title,
              url,
              mediaType as ArtifactMediaType,
              sensitivity as SensitivityLevel
            )
          : await addScopedLinkArtifact({
              scope,
              projectId: scope === "PROJECT" ? ownerIds.projectId : undefined,
              clientId: scope === "CLIENT" ? ownerIds.clientId : undefined,
              title,
              url,
              mediaType,
              sensitivity,
            });
      finalizar(res, t("addedSuccess"));
    });
  };

  const handleImport = () => {
    if (!camposOk) return toast.error(t("requiredFields"));
    if (!validarUrl()) return;
    startTransition(async () => {
      const res = await enqueueArtifactImport({
        scope,
        taskId: ownerIds.taskId,
        projectId: ownerIds.projectId,
        clientId: ownerIds.clientId,
        title,
        url,
        mediaType,
        sensitivity,
      });
      finalizar(res, t("importQueued"));
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
          <div className="space-y-2">
            <Label htmlFor="link-title" className="text-sm">
              {t("name")}
            </Label>
            <Input
              id="link-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titleInputPlaceholder")}
              disabled={isPending}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="link-mediaType" className="text-sm">
                {tUpload("mediaTypeLabel")}
              </Label>
              <Select value={mediaType} onValueChange={setMediaType} disabled={isPending}>
                <SelectTrigger id="link-mediaType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEDIA_TYPES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`mediaTypes.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="link-sensitivity" className="text-sm">
                {tUpload("sensitivityLabel")}
              </Label>
              <Select value={sensitivity} onValueChange={setSensitivity} disabled={isPending}>
                <SelectTrigger id="link-sensitivity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SENSITIVITIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tUpload(`sensitivities.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-url" className="text-sm">
              {t("url")}
            </Label>
            <Input
              id="link-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("urlPlaceholder")}
              disabled={isPending}
            />
          </div>

          <p className="text-xs text-muted-foreground">{t("importHint")}</p>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleAddLink} disabled={isPending || !camposOk}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tCommon("buttons.add")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleImport}
              disabled={isPending || !camposOk || soLink}
            >
              <Download className="mr-2 h-4 w-4" />
              {t("importToNas")}
            </Button>
          </div>

          {soLink && <p className="text-xs text-muted-foreground">{t("importLinkOnlyType")}</p>}
        </div>
      )}
    </div>
  );
}
