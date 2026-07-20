"use client";

import { useRef, useState, type TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { addLinkArtifactVersion, getArtifactVersions } from "@/lib/actions/artifact";
import type { UnifiedArtifactRow } from "@/lib/artifacts/unify";

/**
 * Versionamento de artefatos: form de "nova versão" (por id), histórico expandido (por id)
 * e cache de histórico — não refaz o fetch ao reabrir "ver versões".
 * Compartilha a transição do container (mesmo `isPending` que desabilita os botões).
 */
export function useArtifactVersions(startTransition: TransitionStartFunction) {
  const router = useRouter();

  // Título e tipo são herdados — só a URL muda.
  const [verId, setVerId] = useState<string | null>(null);
  const [verUrl, setVerUrl] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<UnifiedArtifactRow[]>([]);
  // Cache de histórico por id — não refaz o fetch ao reabrir "ver versões".
  const historyCache = useRef<Map<string, UnifiedArtifactRow[]>>(new Map());

  const handleNewVersion = (id: string) => {
    if (!verUrl.trim()) return toast.error("URL é obrigatória.");
    try {
      new URL(verUrl);
    } catch {
      return toast.error("URL inválida.");
    }
    startTransition(async () => {
      const res = await addLinkArtifactVersion(id, { url: verUrl });
      if (res?.success) {
        setVerId(null);
        setVerUrl("");
        historyCache.current.delete(id); // invalida — há uma versão nova
        toast.success("Nova versão criada");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Erro ao criar versão");
      }
    });
  };

  const toggleHistory = (id: string) => {
    if (historyFor === id) {
      setHistoryFor(null);
      setHistory([]);
      return;
    }
    const cached = historyCache.current.get(id);
    if (cached) {
      setHistory(cached);
      setHistoryFor(id);
      return;
    }
    startTransition(async () => {
      const rowsHist = await getArtifactVersions(id);
      historyCache.current.set(id, rowsHist);
      setHistory(rowsHist);
      setHistoryFor(id);
    });
  };

  return {
    verId,
    setVerId,
    verUrl,
    setVerUrl,
    historyFor,
    history,
    handleNewVersion,
    toggleHistory,
  };
}
