"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { retryArtifactImport } from "@/lib/actions/artifact-import";
import type { UnifiedArtifactRow } from "@/lib/artifacts/unify";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { UPLOADABLE_MEDIA_TYPES } from "@/lib/nas/media-types";

const SENSITIVITIES = ["INTERNO", "CLIENTE", "CONFIDENCIAL"];

interface EditFailedImportDialogProps {
  /** Linha selecionada para reedição — a importação que falhou. */
  artifact: UnifiedArtifactRow;
  onClose: () => void;
}

/**
 * A reedição de uma importação que FALHOU (Task 8): reabre os MESMOS quatro campos da aba de
 * link (nome, tipo de mídia, sensibilidade, URL), pré-preenchidos com os valores ATUAIS do
 * artefato — a falha nem sempre é do link (um vídeo declarado FOTOS é recusado pelo teto do
 * tipo), então corrigir só a URL não bastaria. O motivo da falha fica visível acima dos campos:
 * a pessoa precisa ver o que corrigir enquanto corrige.
 */
export function EditFailedImportDialog({ artifact, onClose }: EditFailedImportDialogProps) {
  const t = useTranslations("tasks.artifacts");
  const tUpload = useTranslations("tasks.upload");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [title, setTitle] = useState(artifact.title);
  const [url, setUrl] = useState(artifact.url ?? "");
  const [mediaType, setMediaType] = useState(artifact.mediaType ?? "FOTOS");
  const [sensitivity, setSensitivity] = useState(artifact.sensitivity ?? "INTERNO");

  const motivo = artifact.failedReason
    ? t.has(`nasFailure.${artifact.failedReason}`)
      ? t(`nasFailure.${artifact.failedReason}`)
      : artifact.failedReason
    : null;

  const camposOk = Boolean(title.trim() && url.trim());

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleSubmit = async () => {
    if (!camposOk) return;
    setIsSubmitting(true);
    const res = await retryArtifactImport(artifact.id, {
      title,
      url,
      mediaType,
      sensitivity,
    });
    setIsSubmitting(false);
    if (res && "error" in res && res.error) {
      toast.error(res.error);
      return;
    }
    onClose();
    router.refresh();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editImportTitle")}</DialogTitle>
        </DialogHeader>

        {motivo && <p className="text-sm text-destructive">{motivo}</p>}

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="retry-title" className="text-sm">
              {t("name")}
            </Label>
            <Input
              id="retry-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titleInputPlaceholder")}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="retry-mediaType" className="text-sm">
                {tUpload("mediaTypeLabel")}
              </Label>
              <Select value={mediaType} onValueChange={setMediaType} disabled={isSubmitting}>
                <SelectTrigger id="retry-mediaType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UPLOADABLE_MEDIA_TYPES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`mediaTypes.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="retry-sensitivity" className="text-sm">
                {tUpload("sensitivityLabel")}
              </Label>
              <Select value={sensitivity} onValueChange={setSensitivity} disabled={isSubmitting}>
                <SelectTrigger id="retry-sensitivity">
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
            <Label htmlFor="retry-url" className="text-sm">
              {t("url")}
            </Label>
            <Input
              id="retry-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("urlPlaceholder")}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {tCommon("buttons.cancel")}
            </Button>
            {/* O giro, e não só o botão cinza: reenviar uma importação vai ao servidor, que revalida
                a URL e resela o caminho no NAS. Desabilitar sem dizer nada deixa a tela parecendo
                travada — e esta é uma tela de RECUPERAÇÃO, onde a pessoa já viu uma falha e está
                pronta para desconfiar da próxima. Mesmo tratamento do irmão `AddArtifactForm`. */}
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !camposOk}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tCommon("buttons.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
