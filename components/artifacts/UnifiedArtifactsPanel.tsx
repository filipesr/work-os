"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArtifactType } from "@prisma/client";
import { ExternalLink, Link2, Loader2, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import toast from "react-hot-toast";
import { addLinkArtifact } from "@/lib/actions/task";
import {
  addScopedLinkArtifact,
  removeScopedArtifact,
  addLinkArtifactVersion,
  getArtifactVersions,
} from "@/lib/actions/artifact";
import {
  type UnifiedArtifactRow,
  ORIGIN_LABEL,
  ORIGIN_CHIP,
  artifactTypeLabel,
  sortRows,
} from "@/lib/artifacts/unify";
import { DownloadArtifactButton } from "@/components/tasks/DownloadArtifactButton";
import { UploadArtifactForm } from "@/components/tasks/UploadArtifactForm";

const nasStatus: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pendente", cls: "bg-muted text-muted-foreground border-border" },
  UPLOADING: { label: "Enviando", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  READY: { label: "Pronto", cls: "bg-green-100 text-green-800 border-green-200" },
  FAILED: { label: "Falhou", cls: "bg-red-100 text-red-800 border-red-200" },
  EXPIRED: { label: "Expirado", cls: "bg-muted text-muted-foreground border-border" },
};

const TYPE_OPTIONS: { value: ArtifactType; label: string }[] = [
  { value: "DOCUMENT", label: "Documento" },
  { value: "IMAGE", label: "Imagem" },
  { value: "VIDEO", label: "Vídeo" },
  { value: "FIGMA", label: "Figma" },
  { value: "OTHER", label: "Outro" },
];

interface UnifiedArtifactsPanelProps {
  rows: UnifiedArtifactRow[];
  scope: "TASK" | "PROJECT" | "CLIENT";
  ownerIds: { taskId?: string; projectId?: string; clientId?: string };
  /** Esconde o selo de tarefa para linhas desta tarefa (tela da própria demanda). */
  currentTaskId?: string;
  /** Mostra o formulário de adicionar. */
  canAdd: boolean;
  /** Permite remover artefatos de projeto/cliente (MANAGER+). */
  canRemove: boolean;
}

export function UnifiedArtifactsPanel({
  rows,
  scope,
  ownerIds,
  currentTaskId,
  canAdd,
  canRemove,
}: UnifiedArtifactsPanelProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "upload">("link");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [type, setType] = useState<ArtifactType>("OTHER");
  const [isPending, startTransition] = useTransition();

  // Versionamento: form de "nova versão" aberto (por id) + histórico expandido (por id).
  // Título e tipo são herdados — só a URL muda.
  const [verId, setVerId] = useState<string | null>(null);
  const [verUrl, setVerUrl] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<UnifiedArtifactRow[]>([]);

  const sorted = sortRows(rows);

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
    startTransition(async () => {
      const rowsHist = await getArtifactVersions(id);
      setHistory(rowsHist);
      setHistoryFor(id);
    });
  };

  const handleAddLink = () => {
    if (!title.trim() || !url.trim()) return toast.error("Título e URL são obrigatórios.");
    try {
      new URL(url);
    } catch {
      return toast.error("URL inválida.");
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
        toast.success("Artefato adicionado");
        router.refresh();
      }
    });
  };

  const handleRemove = (id: string) => {
    startTransition(async () => {
      const res = await removeScopedArtifact(id);
      if (res?.success) {
        toast.success("Artefato removido");
        router.refresh();
      } else {
        toast.error(res?.error ?? "Erro ao remover");
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Rows */}
      {sorted.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          Nenhum artefato. Adicione links ou arquivos relevantes.
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((a) => {
            const showTaskBadge = a.taskId != null && a.taskId !== currentTaskId;
            const isNas = a.storageKind === "NAS_UPLOAD";
            return (
              <div key={a.id} className="rounded-lg border bg-card">
                <div className="flex items-start justify-between gap-3 p-3 hover:bg-accent/40 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${ORIGIN_CHIP[a.origin]}`}
                      >
                        {ORIGIN_LABEL[a.origin]}
                      </span>
                      {a.version > 1 && (
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          v{a.version}
                        </span>
                      )}
                      {isNas ? (
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="truncate text-sm font-medium">
                            {a.fileName || a.title}
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                              nasStatus[a.uploadStatus]?.cls ??
                              "bg-muted text-muted-foreground border-border"
                            }`}
                          >
                            {nasStatus[a.uploadStatus]?.label ?? a.uploadStatus}
                          </span>
                        </span>
                      ) : (
                        <a
                          href={a.url ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex min-w-0 items-center gap-1 text-sm font-medium hover:underline"
                        >
                          <span className="truncate">{a.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{artifactTypeLabel(a)}</span>
                      {showTaskBadge && (
                        <>
                          <span>•</span>
                          <span className="truncate">Tarefa: {a.taskTitle}</span>
                        </>
                      )}
                      {a.userName && (
                        <>
                          <span>•</span>
                          <span>{a.userName}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>
                        {a.version > 1 ? "Atualizado" : "Criado"}{" "}
                        {formatDistanceToNow(new Date(a.createdAt), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isNas && a.uploadStatus === "READY" && (
                      <DownloadArtifactButton artifactId={a.id} />
                    )}
                    {a.version > 1 && (
                      <button
                        type="button"
                        onClick={() => toggleHistory(a.id)}
                        disabled={isPending}
                        className="text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        {historyFor === a.id ? "ocultar" : "ver versões"}
                      </button>
                    )}
                    {canAdd && !isNas && a.origin === scope && (
                      <button
                        type="button"
                        onClick={() => setVerId(verId === a.id ? null : a.id)}
                        disabled={isPending}
                        className="text-xs font-semibold text-primary hover:text-primary/80 disabled:opacity-50"
                      >
                        Nova versão
                      </button>
                    )}
                    {canRemove && a.origin === scope && a.origin !== "TASK" && (
                      <button
                        type="button"
                        onClick={() => handleRemove(a.id)}
                        disabled={isPending}
                        className="text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>

                {/* Nova versão (link): título e tipo herdados — só a URL muda. */}
                {verId === a.id && (
                  <div className="space-y-2 border-t border-border p-3">
                    <p className="text-xs text-muted-foreground">
                      Título e tipo são mantidos de <span className="font-semibold">{a.title}</span>{" "}
                      — informe apenas a nova URL.
                    </p>
                    <input
                      type="url"
                      value={verUrl}
                      onChange={(e) => setVerUrl(e.target.value)}
                      placeholder="https://… (nova versão)"
                      disabled={isPending}
                      className="h-10 w-full rounded-lg border-2 border-input-border bg-input px-3 text-sm font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleNewVersion(a.id)}
                      disabled={isPending || !verUrl.trim()}
                      className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Salvar nova versão
                    </button>
                  </div>
                )}

                {/* Histórico de versões */}
                {historyFor === a.id && history.length > 0 && (
                  <ul className="space-y-1 border-t border-border p-3">
                    {history.map((h) => (
                      <li key={h.id} className="flex items-center gap-2 text-xs">
                        <span className="shrink-0 font-bold text-muted-foreground">
                          v{h.version}
                        </span>
                        {h.storageKind === "NAS_UPLOAD" ? (
                          <span className="truncate">{h.fileName || "arquivo"}</span>
                        ) : (
                          <a
                            href={h.url ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-primary hover:underline"
                          >
                            abrir
                          </a>
                        )}
                        {h.userName && (
                          <span className="shrink-0 text-muted-foreground">· {h.userName}</span>
                        )}
                        <span className="shrink-0 text-muted-foreground">
                          {formatDistanceToNow(new Date(h.createdAt), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      {canAdd && (
        <div className="rounded-lg border-2 border-dashed border-border p-4">
          <div className="mb-3 inline-flex rounded-lg border-2 border-border p-0.5">
            <button
              type="button"
              onClick={() => setMode("link")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                mode === "link"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Link2 className="h-4 w-4" /> Adicionar link
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
              <Upload className="h-4 w-4" /> Upload NAS
            </button>
          </div>

          {mode === "upload" ? (
            scope === "TASK" ? (
              <UploadArtifactForm taskId={ownerIds.taskId as string} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Upload no NAS para {scope === "PROJECT" ? "projeto" : "cliente"} estará disponível
                com o rollout do NAS. Por ora, use um link.
              </p>
            )
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título"
                  disabled={isPending}
                  className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 transition-all"
                />
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ArtifactType)}
                  disabled={isPending}
                  className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base font-medium text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 transition-all"
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                disabled={isPending}
                className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 transition-all"
              />
              <button
                type="button"
                onClick={handleAddLink}
                disabled={isPending || !title.trim() || !url.trim()}
                className="inline-flex h-11 items-center rounded-lg bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Adicionar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
