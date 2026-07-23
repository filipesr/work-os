"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AgingCell } from "@/components/shared/AgingCell";
import type { Tone } from "@/lib/status-tone";

export interface StageRow {
  id: string;
  href: string;
  taskTitle: string;
  /** "Cliente · Projeto" já formatado. */
  clientProject: string;
  stageName: string;
  statusTone: Tone;
  statusLabel: string;
  statusIcon?: LucideIcon;
  blocked?: boolean;
  ageHours: number | null;
  slaHours: number | null;
  dueLabel: string | null;
  dueOverdue?: boolean;
  hoursToday?: number | null;
}

/** Tabela canônica de etapas (Meu foco / Meu Trabalho / filas). Linha = link para
 * o detalhe. Colunas configuráveis por contexto. Componente único compartilhado
 * (§3: unificar ActiveStagesTable + MyStagesTable). */
export function StageList({
  rows,
  showHoursToday = false,
  emptyLabel,
}: {
  rows: StageRow[];
  showHoursToday?: boolean;
  emptyLabel?: string;
}) {
  const t = useTranslations("common.stageList");

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyLabel ?? t("empty")}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Cabeçalho (desktop) */}
      <div className="hidden items-center gap-4 border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:flex">
        <span className="min-w-0 flex-1">{t("task")}</span>
        <span className="w-40 shrink-0">{t("stage")}</span>
        <span className="w-28 shrink-0">{t("status")}</span>
        <span className="w-32 shrink-0">{t("aging")}</span>
        <span className="w-32 shrink-0">{t("due")}</span>
        {showHoursToday ? (
          <span className="w-20 shrink-0 text-right">{t("hoursToday")}</span>
        ) : null}
        <span className="w-5 shrink-0" aria-hidden="true" />
      </div>

      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={row.href}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-accent focus:outline-none focus-visible:bg-accent md:flex-nowrap"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-foreground">{row.taskTitle}</div>
                <div className="truncate text-xs text-muted-foreground">{row.clientProject}</div>
              </div>
              <div className="w-40 shrink-0 text-sm text-muted-foreground">{row.stageName}</div>
              <div className="w-28 shrink-0">
                <StatusBadge tone={row.statusTone} label={row.statusLabel} icon={row.statusIcon} />
              </div>
              <div className="w-32 shrink-0">
                <AgingCell ageHours={row.ageHours} slaHours={row.slaHours} blocked={row.blocked} />
              </div>
              <div
                className={`w-32 shrink-0 text-sm ${
                  row.dueOverdue ? "font-medium text-danger" : "text-muted-foreground"
                }`}
              >
                {row.dueLabel ?? "—"}
              </div>
              {showHoursToday ? (
                <div className="w-20 shrink-0 text-right text-sm text-muted-foreground">
                  {row.hoursToday != null ? `${row.hoursToday}h` : "—"}
                </div>
              ) : null}
              <ChevronRight
                className="hidden h-5 w-5 shrink-0 text-muted-foreground md:block"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
