import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import {
  getPersonThroughputSeries,
  getPersonWorkload,
  getPersonUtilization,
  getPersonQuality,
  getPersonReworkEvents,
  getPersonActiveStages,
  getPersonTimeLogs,
} from "@/lib/actions/person-metrics";
import { AGING_ALERT_RATIO } from "@/lib/actions/team-health";
import { ThroughputLine } from "@/components/reports/FlowCharts";
import { UtilizationMeter } from "@/components/reports/UtilizationMeter";
import {
  UTILIZATION_BAND,
  UTILIZATION_BAND_MIN,
  UTILIZATION_BAND_MAX,
} from "@/lib/reporting-constants";
import { utilizationMeter } from "@/lib/team-health-format";
import { SectionCard } from "@/components/ui/SectionCard";
import ReworkClassifyToggle from "@/components/people/ReworkClassifyToggle";

/**
 * A analítica de UMA pessoa — a mesma superfície vista por ela mesma
 * (`/my-evolution`) e pelo gestor (`/reports/user/[id]`). Uma implementação
 * só: se a leitura do gestor divergisse da que a pessoa vê, a conversa de 1:1
 * começaria com as duas partes olhando números diferentes.
 *
 * Coaching, nunca avaliação (P1/P2): tudo aqui é **auto-referenciado** — a
 * pessoa comparada ao próprio histórico, jamais a outras. Não existe ranking,
 * nem nota composta, nem cor de "ruim".
 *
 * `canReclassify` liga o controle de reclassificar retorno (defeito vs mudança
 * legítima) — salvaguarda (4) da exceção 3b. O caller decide, e a decisão certa
 * é gestor/admin olhando OUTRA pessoa: quem reclassifica o próprio retorno está
 * corrigindo a própria nota, que é exatamente o gaming que a regra evita.
 *
 * Todas as queries são fail-closed (`requireSelfOrManager` dentro de
 * person-metrics) — a autorização não depende deste componente ser bem usado.
 */
export async function PersonAnalytics({
  userId,
  range,
  canReclassify = false,
}: {
  userId: string;
  range: { from: Date; to: Date };
  canReclassify?: boolean;
}) {
  const t = await getTranslations("people");

  const [throughput, workload, util, quality, reworkItems, activeStages, timeLogs] =
    await Promise.all([
      getPersonThroughputSeries(userId, 8),
      getPersonWorkload(userId),
      getPersonUtilization(userId, range),
      getPersonQuality(userId, range),
      getPersonReworkEvents(userId, 10),
      getPersonActiveStages(userId),
      getPersonTimeLogs(userId, 10),
    ]);

  const bandKey =
    util.utilization == null ? null : utilizationMeter(util.utilization, UTILIZATION_BAND).position;

  return (
    <div className="space-y-6">
      {/* ---- Entrega ao longo do tempo (auto-referenciada) ---- */}
      <SectionCard title={t("throughput.title")} subtitle={t("selfReferencedNote")}>
        {throughput.some((p) => p.count > 0) ? (
          <ThroughputLine points={throughput} label={t("throughput.title")} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("throughput.empty")}</p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">{t("workload.label")}</p>
            <p className="text-sm font-medium text-foreground">
              {t("workload.value", { wip: workload.wip, aging: workload.aging })}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">{t("utilization.label")}</p>
            {/* Faixa, nunca nota (P7/P1) — mesmo medidor do relatório de horas. */}
            <UtilizationMeter
              utilization={util.utilization}
              emptyLabel={t("utilization.noTarget")}
              bandLabel={
                bandKey == null
                  ? t("utilization.noTarget")
                  : t(`utilization.band.${bandKey}`, {
                      min: Math.round(UTILIZATION_BAND_MIN * 100),
                      max: Math.round(UTILIZATION_BAND_MAX * 100),
                    })
              }
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{t("utilization.note")}</p>
          </div>
        </div>
      </SectionCard>

      {/* ---- Qualidade: o número nunca fica sozinho (salvaguarda 3 da exceção 3b) ---- */}
      <SectionCard title={t("quality.title")} subtitle={t("quality.confoundNote")}>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <span className="text-3xl font-bold tabular-nums text-foreground">
              {quality.firstTimeRight == null
                ? "—"
                : `${Math.round(quality.firstTimeRight * 100)}%`}
            </span>
            <span className="ml-2 text-xs text-muted-foreground">{t("quality.ftr")}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {t("quality.returns", {
              total: quality.defectReturns,
              internal: quality.internal,
              client: quality.client,
            })}
          </div>
        </div>

        {reworkItems.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("quality.noReturns")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {reworkItems.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{r.taskTitle}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.sourceStageName} ·{" "}
                    {t(r.kind === "INTERNAL" ? "quality.kindInternal" : "quality.kindClient")} ·{" "}
                    {new Date(r.at).toLocaleDateString()}
                  </div>
                  {/* O MOTIVO é o material de coaching — nunca esconder atrás do número. */}
                  {r.reason && (
                    <p className="mt-1 text-xs italic text-muted-foreground">“{r.reason}”</p>
                  )}
                </div>
                {canReclassify ? (
                  <ReworkClassifyToggle reworkEventId={r.id} current={r.reworkClass} />
                ) : (
                  <span className="shrink-0 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {t(
                      r.reworkClass === "DEFECT"
                        ? "quality.classDefect"
                        : r.reworkClass === "LEGITIMATE"
                          ? "quality.classLegitimate"
                          : "quality.classUnclassified"
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* ---- Etapas ativas agora (absorvido do CRUD admin) ---- */}
      <SectionCard title={t("activeStages.title")}>
        {activeStages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("activeStages.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {activeStages.map((s) => {
              const isAging = s.agingRatio >= AGING_ALERT_RATIO;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {s.taskTitle}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {s.stageName} · {s.templateName}
                    </div>
                  </div>
                  {/* Envelhecimento é sinal de FLUXO (item parado), não de pessoa —
                      por isso o alerta fica na etapa, e só quando passou do SLA. */}
                  {isAging && (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-warning">
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("activeStages.aging")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* ---- Registros de tempo recentes (absorvido do CRUD admin) ---- */}
      <SectionCard title={t("timeLogs.title")}>
        {timeLogs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("timeLogs.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {timeLogs.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-foreground">{l.taskTitle}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {new Date(l.logDate).toLocaleDateString()}
                    {l.stageName ? ` · ${l.stageName}` : ""}
                    {l.description ? ` · ${l.description}` : ""}
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {l.hoursSpent.toFixed(1)}h
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
