"use client";

import { useRef, useState, type ChangeEvent, type TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { removeFailedArtifact } from "@/lib/actions/artifact";
import { guessMediaType, uploadFileToNas } from "@/lib/nas/upload-client";

interface UseNasReuploadArgs {
  scope: "TASK" | "PROJECT" | "CLIENT";
  ownerIds: { taskId?: string; projectId?: string; clientId?: string };
  startTransition: TransitionStartFunction;
}

/**
 * Recuperação de uploads NAS travados/falhos: um file input escondido (alvo por ref) para reenviar,
 * mais a remoção de um upload não-READY. Compartilha a transição do container.
 */
export function useNasReupload({ scope, ownerIds, startTransition }: UseNasReuploadArgs) {
  const router = useRouter();

  // Um file input escondido, alvo por ref.
  const inputRef = useRef<HTMLInputElement>(null);
  const forRef = useRef<string | null>(null);
  const [reenviarBusy, setReenviarBusy] = useState<string | null>(null);

  // Recuperação: remove um upload NAS não-READY (travado/falho).
  const handleRemoveFailed = (id: string) => {
    startTransition(async () => {
      const res = await removeFailedArtifact(id);
      if (res?.success) {
        toast.success("Removido");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Erro ao remover");
      }
    });
  };

  // Reenviar: abre o seletor de arquivo para o artefato alvo; ao escolher, sobe de novo (mesmo nome
  // = nova versão; nome diferente = artefato novo — o servidor decide pela identidade do arquivo).
  const startReenviar = (id: string) => {
    forRef.current = id;
    inputRef.current?.click();
  };

  const handleReenviarFile = async (file: File | null) => {
    const id = forRef.current;
    if (!file || !id) return;
    setReenviarBusy(id);
    const res = await uploadFileToNas(file, {
      scope,
      taskId: ownerIds.taskId,
      projectId: ownerIds.projectId,
      clientId: ownerIds.clientId,
      mediaType: guessMediaType(file.name) ?? "OUTROS",
    });
    setReenviarBusy(null);
    if (res.ok) {
      toast.success(`Reenviado: ${res.fileName}. Finalizando…`);
      setTimeout(() => router.refresh(), 1500);
    } else {
      toast.error(res.error);
    }
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = ""; // permite re-selecionar o mesmo arquivo
    void handleReenviarFile(f);
  };

  return {
    inputRef,
    reenviarBusy,
    startReenviar,
    handleRemoveFailed,
    onInputChange,
  };
}
