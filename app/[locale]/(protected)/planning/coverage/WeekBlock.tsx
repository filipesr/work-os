"use client";

import { useState } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { BatchCreateDialog } from "@/components/planning/calendar/BatchCreateDialog";
import type {
  ClientOption,
  ProjectOption,
  TemplateOption,
} from "@/components/planning/calendar/monthly-types";
import type { WeekCoverage, OccurrenceTask, CoverageClient } from "@/lib/actions/weekly-coverage";
import { ClientChips } from "./ClientChips";
import { DemandChips } from "./DemandChips";
import { DemandSummaryDialog } from "./DemandSummaryDialog";

interface BatchState {
  date: string;
  title?: string;
  occurrenceId?: string;
  preselectedProjectIds?: string[];
}

/**
 * Uma semana da janela de planejamento.
 *
 * O eixo é o CLIENTE: o cabeçalho responde "quantos têm agenda nesta semana" e o
 * corpo nomeia **quem** está de fora. Uma semana sem feriado nenhum continua
 * sendo um card — cliente parado é problema mesmo sem data comemorativa.
 *
 * Sem colapsar: com duas colunas o card já é curto, e esconder o conteúdo
 * obrigava um clique só para descobrir se havia algo a fazer.
 *
 * Três gatilhos de criação, cada um com um preenchimento diferente — era essa a
 * redundância anterior, em que todos abriam o mesmo diálogo vazio:
 *  - cabeçalho → semana (data = segunda), nenhum projeto marcado;
 *  - data      → aquele dia, vinculando a demanda à ocorrência;
 *  - cliente   → semana, com os PROJETOS DAQUELE CLIENTE já marcados.
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
  const [batch, setBatch] = useState<BatchState | null>(null);
  const [demand, setDemand] = useState<OccurrenceTask | null>(null);

  const covered = week.withDemand.length;
  const tone = covered === 0 ? "warning" : covered >= totalClients ? "success" : "neutral";

  const fmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
  const rangeLabel = `${fmt.format(new Date(`${week.startIso}T00:00:00Z`))} – ${fmt.format(
    new Date(`${week.endIso}T00:00:00Z`)
  )}`;

  const openForClient = (client: CoverageClient) =>
    setBatch({
      date: week.startIso,
      preselectedProjectIds: projects.filter((p) => p.clientId === client.id).map((p) => p.id),
    });

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-card shadow-sm ${
        isCurrent ? "border-primary/40 bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
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
        {/* Criar para a SEMANA — sem data comemorativa, sem cliente definido. */}
        <button
          type="button"
          onClick={() => setBatch({ date: week.startIso })}
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t("create")}
        </button>
      </div>

      <div className="space-y-4 border-t border-border px-4 pb-4 pt-3">
        {week.occurrences.length > 0 && (
          <div className="space-y-2.5">
            {week.occurrences.map((o) => (
              <div key={o.id} className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
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
                  <button
                    type="button"
                    onClick={() =>
                      setBatch({
                        date: o.iso,
                        title: isEs ? o.titleEs : o.titlePt,
                        occurrenceId: o.id,
                      })
                    }
                    className="ml-auto inline-flex shrink-0 items-center gap-1 rounded border border-border px-2 py-0.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    {t("create")}
                  </button>
                </div>

                {/* Demandas já vinculadas a ESTA data. O número sozinho ("1
                    cliente já com demanda") não dizia qual era nem deixava
                    conferir sem sair da tela. */}
                {o.tasks.length > 0 && (
                  <div className="pl-1">
                    <DemandChips tasks={o.tasks} onPick={setDemand} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Demandas de ROTINA da semana — sem vínculo com data. São a maior
            parte do trabalho: sem elas o card mostrava só a agenda sazonal e
            dava a impressão de uma semana vazia que estava cheia. Tom neutro
            para não competir com as sazonais. */}
        {week.unlinked.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("week.otherDemands", { count: week.unlinked.length })}
            </p>
            <DemandChips tasks={week.unlinked} onPick={setDemand} tone="muted" />
          </div>
        )}

        {week.idle.length === 0 ? (
          <p className="text-sm text-success">{t("week.allCovered")}</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("week.idleTitle", { count: week.idle.length })}
            </p>
            <ClientChips clients={week.idle} onPick={openForClient} />
          </div>
        )}
      </div>

      {batch && (
        <BatchCreateDialog
          date={batch.date}
          eventTitle={batch.title}
          occurrenceId={batch.occurrenceId}
          preselectedProjectIds={batch.preselectedProjectIds}
          clients={clients}
          projects={projects}
          templates={templates}
          onClose={() => setBatch(null)}
        />
      )}

      <DemandSummaryDialog task={demand} locale={locale} onClose={() => setDemand(null)} />
    </div>
  );
}
