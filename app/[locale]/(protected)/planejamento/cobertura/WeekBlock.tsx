"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CalendarDays, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BatchCreateDialog } from "@/components/planejamento/calendario/BatchCreateDialog";
import type {
  ClientOption,
  ProjectOption,
  TemplateOption,
} from "@/components/planejamento/calendario/monthly-types";
import type { WeekCoverage } from "@/lib/actions/weekly-coverage";

/**
 * Uma semana da janela de planejamento.
 *
 * O eixo é o CLIENTE: o cabeçalho responde "quantos clientes têm agenda nesta
 * semana", e o corpo nomeia **quem** está de fora. Antes a tela só dizia
 * "0 de 1 clientes" — um número sem sujeito, sobre o qual não dá para agir.
 *
 * As datas do calendário aparecem como contexto dentro da semana, não como a
 * estrutura: uma semana sem feriado nenhum continua sendo uma linha, porque
 * cliente parado é problema mesmo quando não há data comemorativa.
 */
export function WeekBlock({
  week,
  totalClients,
  isCurrent,
  isEs,
  clients,
  projects,
  templates,
  locale,
}: {
  week: WeekCoverage;
  totalClients: number;
  isCurrent: boolean;
  isEs: boolean;
  clients: ClientOption[];
  projects: ProjectOption[];
  templates: TemplateOption[];
  locale: string;
}) {
  const t = useTranslations("planning.coverage");
  // Semanas sem ninguém coberto abrem sozinhas: são as que pedem ação.
  const [open, setOpen] = useState(week.withDemand.length === 0 || isCurrent);
  const [batch, setBatch] = useState<{
    date: string;
    title?: string;
    occurrenceId?: string;
  } | null>(null);

  const covered = week.withDemand.length;
  const tone = covered === 0 ? "warning" : covered >= totalClients ? "success" : "neutral";

  // Numérico compacto (15/08) em vez de "15 de ago.": não quebra linha, cabe
  // nas duas colunas e é inequívoco em pt-BR e es-ES.
  const fmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
  const rangeLabel = `${fmt.format(new Date(`${week.startIso}T00:00:00Z`))} – ${fmt.format(
    new Date(`${week.endIso}T00:00:00Z`)
  )}`;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-card shadow-sm ${
        isCurrent ? "border-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-accent"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="shrink-0 whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
          {rangeLabel}
        </span>
        {isCurrent && <StatusBadge tone="info" label={t("week.current")} />}
        <StatusBadge tone={tone} label={t("week.coverage", { covered, total: totalClients })} />
        {week.occurrences.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {t("week.dates", { count: week.occurrences.length })}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-4 pb-4 pt-3">
          {/* Datas da semana — contexto e gancho de ação. */}
          {week.occurrences.length > 0 && (
            <div className="space-y-1.5">
              {week.occurrences.map((o) => (
                <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                    {fmt.format(new Date(`${o.iso}T00:00:00Z`))}
                  </span>
                  <span className="font-medium text-foreground">
                    {isEs ? o.titleEs : o.titlePt}
                  </span>
                  <StatusBadge
                    tone={
                      o.kind === "HOLIDAY"
                        ? "neutral"
                        : o.kind === "COMMERCIAL"
                          ? "info"
                          : "success"
                    }
                    label={t(`kind.${o.kind}`)}
                  />
                  {o.linkedClients > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {t("week.linkedClients", { count: o.linkedClients })}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setBatch({
                        date: o.iso,
                        title: isEs ? o.titleEs : o.titlePt,
                        occurrenceId: o.id,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    {t("createDemand")}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* QUEM está de fora — a resposta que o número sozinho não dava. */}
          <div className="space-y-2">
            {week.idle.length === 0 ? (
              <p className="text-sm text-success">{t("week.allCovered")}</p>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("week.idleTitle", { count: week.idle.length })}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {week.idle.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setBatch({ date: week.startIso })}
                      title={t("week.createForClient", { client: c.name })}
                      className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-subtle px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-accent"
                    >
                      {c.name}
                      <Plus className="h-3 w-3 opacity-60" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {week.withDemand.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("week.withDemand", {
                  clients: week.withDemand.map((c) => c.name).join(", "),
                })}
              </p>
            )}
          </div>
        </div>
      )}

      {batch && (
        <BatchCreateDialog
          date={batch.date}
          eventTitle={batch.title}
          occurrenceId={batch.occurrenceId}
          clients={clients}
          projects={projects}
          templates={templates}
          onClose={() => setBatch(null)}
        />
      )}
    </div>
  );
}
