"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  type UnifiedArtifactRow,
  ORIGIN_LABEL,
  ORIGIN_CHIP,
  artifactTypeLabel,
} from "@/lib/artifacts/unify";
import { DownloadArtifactButton } from "@/components/tasks/DownloadArtifactButton";

// < 24h: "há cerca de X"; depois: "em dd/mm/yyyy às hh:mm".
function formatArtifactTime(date: Date): string {
  const ageMs = Date.now() - date.getTime();
  if (ageMs < 24 * 60 * 60 * 1000) {
    return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
  }
  return `em ${format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`;
}

const nasStatus: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pendente", cls: "bg-muted text-muted-foreground border-border" },
  UPLOADING: { label: "Enviando", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  READY: { label: "Pronto", cls: "bg-green-100 text-green-800 border-green-200" },
  FAILED: { label: "Falhou", cls: "bg-red-100 text-red-800 border-red-200" },
  EXPIRED: { label: "Expirado", cls: "bg-muted text-muted-foreground border-border" },
};

interface ArtifactRowProps {
  row: UnifiedArtifactRow;
  scope: "TASK" | "PROJECT" | "CLIENT";
  /** Esconde o selo de tarefa para linhas desta tarefa (tela da própria demanda). */
  currentTaskId?: string;
  canAdd: boolean;
  canRemove: boolean;
  isPending: boolean;
  // Versionamento
  verId: string | null;
  onSetVerId: (id: string | null) => void;
  verUrl: string;
  onSetVerUrl: (url: string) => void;
  historyFor: string | null;
  history: UnifiedArtifactRow[];
  onNewVersion: (id: string) => void;
  onToggleHistory: (id: string) => void;
  // Recuperação NAS
  reenviarBusy: string | null;
  onReenviar: (id: string) => void;
  onRemoveFailed: (id: string) => void;
  // Remoção de artefato de escopo (projeto/cliente)
  onRemove: (id: string) => void;
}

export function ArtifactRow({
  row: a,
  scope,
  currentTaskId,
  canAdd,
  canRemove,
  isPending,
  verId,
  onSetVerId,
  verUrl,
  onSetVerUrl,
  historyFor,
  history,
  onNewVersion,
  onToggleHistory,
  reenviarBusy,
  onReenviar,
  onRemoveFailed,
  onRemove,
}: ArtifactRowProps) {
  const showTaskBadge = a.taskId != null && a.taskId !== currentTaskId;
  const isNas = a.storageKind === "NAS_UPLOAD";
  return (
    <div className="rounded-lg border bg-card">
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
                <span className="truncate text-sm font-medium">{a.fileName || a.title}</span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                    nasStatus[a.uploadStatus]?.cls ?? "bg-muted text-muted-foreground border-border"
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
              {a.version > 1 ? "Atualizado" : "Criado"} {formatArtifactTime(new Date(a.createdAt))}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isNas && a.uploadStatus === "READY" && <DownloadArtifactButton artifactId={a.id} />}
          {isNas && a.uploadStatus !== "READY" && a.origin === scope && (
            <>
              <button
                type="button"
                onClick={() => onReenviar(a.id)}
                disabled={isPending || reenviarBusy !== null}
                className="text-xs font-semibold text-primary hover:text-primary/80 disabled:opacity-50"
              >
                {reenviarBusy === a.id ? "Enviando…" : "Reenviar"}
              </button>
              <button
                type="button"
                onClick={() => onRemoveFailed(a.id)}
                disabled={isPending || reenviarBusy !== null}
                className="text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                Remover
              </button>
            </>
          )}
          {a.version > 1 && (
            <button
              type="button"
              onClick={() => onToggleHistory(a.id)}
              disabled={isPending}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {historyFor === a.id ? "ocultar" : "ver versões"}
            </button>
          )}
          {canAdd && !isNas && a.origin === scope && (
            <button
              type="button"
              onClick={() => onSetVerId(verId === a.id ? null : a.id)}
              disabled={isPending}
              className="text-xs font-semibold text-primary hover:text-primary/80 disabled:opacity-50"
            >
              Nova versão
            </button>
          )}
          {canRemove && a.origin === scope && a.origin !== "TASK" && (
            <button
              type="button"
              onClick={() => onRemove(a.id)}
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
            Título e tipo são mantidos de <span className="font-semibold">{a.title}</span> — informe
            apenas a nova URL.
          </p>
          <input
            type="url"
            value={verUrl}
            onChange={(e) => onSetVerUrl(e.target.value)}
            placeholder="https://… (nova versão)"
            disabled={isPending}
            className="h-10 w-full rounded-lg border-2 border-input-border bg-input px-3 text-sm font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={() => onNewVersion(a.id)}
            disabled={isPending || !verUrl.trim()}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar nova versão
          </button>
        </div>
      )}

      {/* Histórico de versões — exclui a versão atual (já exibida no card acima) */}
      {historyFor === a.id && history.some((h) => h.id !== a.id) && (
        <ul className="space-y-1 border-t border-border p-3">
          {history
            .filter((h) => h.id !== a.id)
            .map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-xs">
                <span className="shrink-0 font-bold text-muted-foreground">v{h.version}</span>
                {h.storageKind === "NAS_UPLOAD" ? (
                  h.uploadStatus === "READY" ? (
                    <DownloadArtifactButton artifactId={h.id} iconOnly />
                  ) : (
                    <span className="shrink-0 text-muted-foreground">
                      ({nasStatus[h.uploadStatus]?.label ?? h.uploadStatus})
                    </span>
                  )
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
                  {formatArtifactTime(new Date(h.createdAt))}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
