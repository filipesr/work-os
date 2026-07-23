"use client";

import { useTranslations, useLocale } from "next-intl";
import { ExternalLink, Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { dateFnsLocale, atConnector } from "@/lib/date-locale";
import { Input } from "@/components/ui/input";
import {
  type UnifiedArtifactRow,
  ORIGIN_CHIP,
  originLabelKey,
  artifactTypeLabelKey,
} from "@/lib/artifacts/unify";
import { DownloadArtifactButton } from "@/components/tasks/DownloadArtifactButton";

// < 24h: "há cerca de X"; depois: "em dd/mm/yyyy às hh:mm" (conector conforme locale).
function formatArtifactTime(
  date: Date,
  t: (key: any, values?: Record<string, string>) => string,
  locale: string
): string {
  const ageMs = Date.now() - date.getTime();
  if (ageMs < 24 * 60 * 60 * 1000) {
    return formatDistanceToNow(date, { addSuffix: true, locale: dateFnsLocale(locale) });
  }
  return t("timeOn", {
    date: format(date, `dd/MM/yyyy '${atConnector(locale)}' HH:mm`, {
      locale: dateFnsLocale(locale),
    }),
  });
}

// CSS por status; o rótulo textual vem das traduções (nasStatus.<STATUS>).
const nasStatusCls: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground border-border",
  UPLOADING: "bg-indigo-100 text-indigo-800 border-indigo-200",
  READY: "bg-success-subtle text-success border-success/40",
  FAILED: "bg-danger-subtle text-danger border-danger/40",
  EXPIRED: "bg-muted text-muted-foreground border-border",
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
  const t = useTranslations("tasks.artifacts");
  const locale = useLocale();
  const nasLabel = (status: string) =>
    t.has(`nasStatus.${status}`) ? t(`nasStatus.${status}`) : status;
  const typeLabel = (row: UnifiedArtifactRow): string => {
    const key = artifactTypeLabelKey(row);
    if (!key) return "—";
    if (t.has(key)) return t(key);
    return row.storageKind === "NAS_UPLOAD" ? (row.mediaType ?? "—") : (row.type ?? "—");
  };
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
              {t(originLabelKey(a.origin))}
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
                    nasStatusCls[a.uploadStatus] ?? "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {nasLabel(a.uploadStatus)}
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
            <span>{typeLabel(a)}</span>
            {showTaskBadge && (
              <>
                <span>•</span>
                <span className="truncate">{t("taskLabel", { title: a.taskTitle ?? "" })}</span>
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
              {a.version > 1 ? t("updated") : t("created")}{" "}
              {formatArtifactTime(new Date(a.createdAt), t, locale)}
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
                {reenviarBusy === a.id ? t("reenviarPending") : t("reenviar")}
              </button>
              <button
                type="button"
                onClick={() => onRemoveFailed(a.id)}
                disabled={isPending || reenviarBusy !== null}
                className="text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
              >
                {t("remove")}
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
              {historyFor === a.id ? t("hideVersions") : t("viewVersions")}
            </button>
          )}
          {canAdd && !isNas && a.origin === scope && (
            <button
              type="button"
              onClick={() => onSetVerId(verId === a.id ? null : a.id)}
              disabled={isPending}
              className="text-xs font-semibold text-primary hover:text-primary/80 disabled:opacity-50"
            >
              {t("newVersion")}
            </button>
          )}
          {canRemove && a.origin === scope && a.origin !== "TASK" && (
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              disabled={isPending}
              className="text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              {t("remove")}
            </button>
          )}
        </div>
      </div>

      {/* Nova versão (link): título e tipo herdados — só a URL muda. */}
      {verId === a.id && (
        <div className="space-y-2 border-t border-border p-3">
          <p className="text-xs text-muted-foreground">
            {t("newVersionHintBefore")} <span className="font-semibold">{a.title}</span>{" "}
            {t("newVersionHintAfter")}
          </p>
          <Input
            type="url"
            value={verUrl}
            onChange={(e) => onSetVerUrl(e.target.value)}
            placeholder={t("newVersionPlaceholder")}
            disabled={isPending}
          />
          <button
            type="button"
            onClick={() => onNewVersion(a.id)}
            disabled={isPending || !verUrl.trim()}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("saveNewVersion")}
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
                      ({nasLabel(h.uploadStatus)})
                    </span>
                  )
                ) : (
                  <a
                    href={h.url ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-primary hover:underline"
                  >
                    {t("open")}
                  </a>
                )}
                {h.userName && (
                  <span className="shrink-0 text-muted-foreground">· {h.userName}</span>
                )}
                <span className="shrink-0 text-muted-foreground">
                  {formatArtifactTime(new Date(h.createdAt), t, locale)}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
