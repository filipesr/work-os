import { Suspense, cache } from "react";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { redirect } from "next/navigation";
import {
  getAverageTimePerStage,
  getReworkRateByStage,
  getLeadTimeMetrics,
  getFlowEfficiencyByStage,
  getCycleTimePercentiles,
  getDeliveryForecast,
  getThroughputSeries,
  getFlowCfdSeries,
  getAvailablePerformanceMonths,
  getReworkBySourceStage,
  getFirstTimeRightByStage,
  getOnTimeRate,
  getTeamThroughput,
  getStageDuration,
  type PerformanceFilters,
  type PeriodRange,
} from "@/lib/actions/reporting";
import { ThroughputLine, StatusCfd, CycleScatter } from "@/components/reports/FlowCharts";
import { OnTimeRateCard } from "@/components/reports/team-productivity/OnTimeRateCard";
import { ThroughputTable } from "@/components/reports/team-productivity/ThroughputTable";
import { StageDurationTable } from "@/components/reports/team-productivity/StageDurationTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import {
  TrendingDown,
  AlertTriangle,
  Timer,
  Hourglass,
  Activity,
  Gauge,
  Target,
  Dice5,
  LineChart,
  Layers,
  Users,
  BarChart3,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { CardSkeleton, MetricsSkeleton } from "@/components/reports/skeletons";
import { parseReportFilters } from "@/lib/reports/filters";

// Dedupe queries shared across two layout positions each (alert + table) so they
// run once per request while still streaming in their own Suspense boundaries.
const loadAvgTime = cache((filters: PerformanceFilters) => getAverageTimePerStage(filters));
const loadRework = cache((filters: PerformanceFilters) => getReworkRateByStage(filters));

type T = Awaited<ReturnType<typeof getTranslations>>;

/** Flat stat tile (nexo v2): semantic-tinted icon chip + value, no gradients. */
function StatTile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof Timer;
  tone: "info" | "success" | "warning";
  label: string;
  value: string;
}) {
  const chip =
    tone === "success"
      ? "bg-success-subtle text-success"
      : tone === "warning"
        ? "bg-warning-subtle text-warning"
        : "bg-primary/10 text-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${chip}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}

async function LeadTimeSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const leadTimeMetrics = await getLeadTimeMetrics(filters);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatTile
          icon={Timer}
          tone="info"
          label={t("leadTimeMetrics.average")}
          value={`${leadTimeMetrics.averageLeadTimeDays.toFixed(1)} ${t("leadTimeMetrics.days")}`}
        />
        <StatTile
          icon={Activity}
          tone="success"
          label={t("leadTimeMetrics.median")}
          value={`${leadTimeMetrics.medianLeadTimeDays.toFixed(1)} ${t("leadTimeMetrics.days")}`}
        />
        {/* Tempo de fila = lead − cycle. É a parte do prazo que a execução NÃO
            controla; sem ele o gestor confunde "somos lentos" com "esperou muito". */}
        <StatTile
          icon={Hourglass}
          tone="warning"
          label={t("leadTimeMetrics.queue")}
          value={
            leadTimeMetrics.medianQueueTimeDays === null
              ? "—"
              : `${leadTimeMetrics.medianQueueTimeDays.toFixed(1)} ${t("leadTimeMetrics.days")}`
          }
        />
        <StatTile
          icon={TrendingDown}
          tone="info"
          label={t("leadTimeMetrics.count")}
          value={`${leadTimeMetrics.count}`}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {leadTimeMetrics.medianQueueTimeDays === null
          ? t("leadTimeMetrics.queueNoData")
          : t("leadTimeMetrics.queueHint", { count: leadTimeMetrics.queueCount })}
      </p>
    </div>
  );
}

async function BottlenecksSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const averageTimePerStage = await loadAvgTime(filters);
  const bottlenecks = averageTimePerStage.slice(0, 3);

  if (bottlenecks.length === 0) return null;

  return (
    <section className="rounded-xl border border-warning/40 bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b border-border p-6">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning-subtle text-warning">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("bottlenecks.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("bottlenecks.description")}</p>
        </div>
      </div>
      <div className="space-y-2 p-6">
        {bottlenecks.map((stage) => (
          <div
            key={stage.stageId}
            className="flex items-center justify-between rounded-lg border border-warning/40 bg-warning-subtle p-3"
          >
            <div>
              <div className="font-medium text-foreground">{stage.stageName}</div>
              <div className="text-xs text-muted-foreground">
                {stage.templateName} • {stage.count} {t("bottlenecks.occurrences")}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-warning">
                {stage.averageDurationDays.toFixed(1)} {t("bottlenecks.days")}
              </div>
              <div className="text-xs text-muted-foreground">
                {stage.averageDurationHours.toFixed(1)} {t("bottlenecks.hours")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

async function AvgTimeSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const averageTimePerStage = await loadAvgTime(filters);

  const exportRows = averageTimePerStage.map((s) => ({
    stage: s.stageName,
    template: s.templateName,
    days: Number(s.averageDurationDays.toFixed(1)),
    count: s.count,
  }));

  return (
    <SectionCard
      title={t("avgTimePerStage.title")}
      icon={Timer}
      action={
        <ExportButtons
          filename="avg-time-per-stage"
          title={t("avgTimePerStage.title")}
          columns={[
            { key: "stage", header: t("avgTimePerStage.stageHeader") },
            { key: "template", header: "Template" },
            { key: "days", header: t("avgTimePerStage.timeHeader") },
            { key: "count", header: "x" },
          ]}
          rows={exportRows}
        />
      }
    >
      {averageTimePerStage.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("avgTimePerStage.noData")}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 border-b border-border pb-2 text-sm font-semibold">
            <div className="col-span-2">{t("avgTimePerStage.stageHeader")}</div>
            <div className="text-right">{t("avgTimePerStage.timeHeader")}</div>
          </div>
          {averageTimePerStage.map((stage) => (
            <div key={stage.stageId} className="grid grid-cols-3 gap-2 text-sm">
              <div className="col-span-2">
                <div className="truncate font-medium">{stage.stageName}</div>
                <div className="text-xs text-muted-foreground">
                  {stage.templateName} • {stage.count}x
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium tabular-nums">
                  {stage.averageDurationDays.toFixed(1)}d
                </div>
                <div className="text-xs text-muted-foreground">
                  {stage.averageDurationHours.toFixed(0)}h
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

async function CycleTimeSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const cycle = await getCycleTimePercentiles(filters);

  return (
    <SectionCard title={t("cycleTime.title")} subtitle={t("cycleTime.description")} icon={Target}>
      {cycle.count === 0 ? (
        // Estado esperado logo após a migração: há concluídas, mas nenhuma foi
        // iniciada com o carimbo. Explicar o vazio em vez de só dizer "sem dados".
        <p className="text-sm text-muted-foreground">
          {cycle.excludedLegacy > 0
            ? t("cycleTime.noDataLegacy", { count: cycle.excludedLegacy })
            : t("cycleTime.noData")}
        </p>
      ) : (
        <>
          {cycle.lowConfidence && (
            <p className="mb-3 text-xs text-warning">
              {t("cycleTime.lowConfidence", { count: cycle.count })}
            </p>
          )}
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3 text-center">
              <div className="text-xs text-muted-foreground">{t("cycleTime.p50")}</div>
              <div className="text-xl font-bold tabular-nums">{cycle.p50.toFixed(1)}d</div>
            </div>
            <div className="rounded-lg border-2 border-primary p-3 text-center">
              <div className="text-xs text-primary">{t("cycleTime.p85")}</div>
              <div className="text-xl font-bold tabular-nums text-primary">
                {cycle.p85.toFixed(1)}d
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <div className="text-xs text-danger">{t("cycleTime.p95")}</div>
              <div className="text-xl font-bold tabular-nums">{cycle.p95.toFixed(1)}d</div>
            </div>
          </div>
          <CycleScatter
            points={cycle.points}
            p50={cycle.p50}
            p85={cycle.p85}
            p95={cycle.p95}
            ariaLabel={t("cycleTime.title")}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("cycleTime.footnote", { count: cycle.count })}
            {cycle.excludedLegacy > 0 &&
              ` ${t("cycleTime.legacyExcluded", { count: cycle.excludedLegacy })}`}
          </p>
        </>
      )}
    </SectionCard>
  );
}

async function ForecastSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const f = await getDeliveryForecast(filters);

  return (
    <SectionCard
      title={t("forecast.title")}
      subtitle={t("forecast.description")}
      icon={Dice5}
      className="border-primary/40"
    >
      {f.totalThroughput === 0 ? (
        <p className="text-sm text-muted-foreground">{t("forecast.noData")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">{t("forecast.backlog")}</div>
            <div className="text-2xl font-bold tabular-nums">{f.backlog}</div>
          </div>
          <div className="rounded-lg border-2 border-primary p-3">
            <div className="text-xs text-primary">{t("forecast.whenP85")}</div>
            <div className="text-2xl font-bold tabular-nums text-primary">
              {f.when ? t("forecast.days", { days: Math.ceil(f.when.p85) }) : "—"}
            </div>
            {f.when && (
              <div className="text-xs text-muted-foreground">
                p50 {Math.ceil(f.when.p50)}d · p95 {Math.ceil(f.when.p95)}d
              </div>
            )}
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">
              {t("forecast.howMany", { days: f.horizonDays })}
            </div>
            <div className="text-2xl font-bold tabular-nums">{Math.floor(f.howMany.p50)}</div>
            <div className="text-xs text-muted-foreground">
              p85 ≥ {Math.floor(f.howMany.p85)} · p95 ≥ {Math.floor(f.howMany.p95)}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

async function ThroughputSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const points = await getThroughputSeries(filters);
  const hasData = points.some((p) => p.count > 0);

  return (
    <SectionCard
      title={t("throughput.title")}
      subtitle={t("throughput.description")}
      icon={LineChart}
    >
      {hasData ? (
        <ThroughputLine points={points} label={t("throughput.title")} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("throughput.noData")}</p>
      )}
    </SectionCard>
  );
}

async function CfdSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const points = await getFlowCfdSeries(filters);
  const hasData = points.some((p) => p.COMPLETED + p.ACTIVE + p.BLOCKED + p.INACTIVE > 0);

  return (
    <SectionCard title={t("cfd.title")} subtitle={t("cfd.description")} icon={Layers}>
      {hasData ? (
        <StatusCfd
          points={points}
          labels={{
            COMPLETED: t("cfd.completed"),
            ACTIVE: t("cfd.active"),
            BLOCKED: t("cfd.blocked"),
            INACTIVE: t("cfd.inactive"),
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t("cfd.noData")}</p>
      )}
    </SectionCard>
  );
}

async function FlowEfficiencySection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const flowByStage = await getFlowEfficiencyByStage(filters);

  return (
    <SectionCard
      title={t("flowEfficiency.title")}
      subtitle={t("flowEfficiency.description")}
      icon={Gauge}
    >
      {flowByStage.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("flowEfficiency.noData")}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 border-b border-border pb-2 text-sm font-semibold">
            <div className="col-span-2">{t("flowEfficiency.stageHeader")}</div>
            <div className="text-right">{t("flowEfficiency.efficiencyHeader")}</div>
          </div>
          {flowByStage.map((stage) => {
            const pct = Math.round(stage.flowEfficiency * 100);
            // Low efficiency = mostly waiting = the problem to surface.
            const tone = pct < 40 ? "text-danger" : pct < 70 ? "text-warning" : "text-success";
            return (
              <div key={stage.stageId} className="grid grid-cols-3 items-center gap-2 text-sm">
                <div className="col-span-2">
                  <div className="truncate font-medium">{stage.stageName}</div>
                  <div className="text-xs text-muted-foreground">
                    {stage.templateName} • {stage.count}x •{" "}
                    {t("flowEfficiency.waitingHours", {
                      hours: stage.blockedHours.toFixed(0),
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold tabular-nums ${tone}`}>{pct}%</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

async function ReworkSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const reworkRateByStage = await loadRework(filters);

  return (
    <SectionCard title={t("reworkRate.title")} icon={AlertTriangle}>
      {reworkRateByStage.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("reworkRate.noData")}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2 border-b border-border pb-2 text-sm font-semibold">
            <div className="col-span-2">{t("reworkRate.stageHeader")}</div>
            <div className="text-center">{t("reworkRate.completedRevertedHeader")}</div>
            <div className="text-right">{t("reworkRate.rateHeader")}</div>
          </div>
          {reworkRateByStage.map((stage) => {
            const reworkPercentage = (stage.reworkRate * 100).toFixed(0);
            const isHighRework = stage.reworkRate > 0.15;

            return (
              <div
                key={stage.stageId}
                className={`grid grid-cols-4 gap-2 rounded p-2 text-sm ${
                  isHighRework ? "border border-danger/40 bg-danger-subtle" : ""
                }`}
              >
                <div className="col-span-2">
                  <div className="truncate font-medium">{stage.stageName}</div>
                  <div className="truncate text-xs text-muted-foreground">{stage.templateName}</div>
                </div>
                <div className="text-center text-xs">
                  <div className="font-medium text-success">{stage.completed}</div>
                  <div className="font-medium text-danger">{stage.reverted}</div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-bold tabular-nums ${isHighRework ? "text-danger" : "text-foreground"}`}
                  >
                    {reworkPercentage}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

async function FirstTimeRightSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const rows = await getFirstTimeRightByStage(filters);
  return (
    <SectionCard title={t("firstTimeRight.title")} subtitle={t("firstTimeRight.description")}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("firstTimeRight.noData")}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const pct = Math.round(r.firstTimeRight * 100);
            const tone = pct >= 85 ? "text-success" : pct >= 60 ? "text-warning" : "text-danger";
            return (
              <div key={r.stageId} className="grid grid-cols-3 items-center gap-2 text-sm">
                <div className="col-span-2">
                  <div className="truncate font-medium">{r.stageName}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.templateName} •{" "}
                    {t("firstTimeRight.counts", {
                      completed: r.completed,
                      reworked: r.reworkedTo,
                    })}
                  </div>
                </div>
                <div className={`text-right text-lg font-bold tabular-nums ${tone}`}>{pct}%</div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">{t("firstTimeRight.legend")}</p>
    </SectionCard>
  );
}

async function ReworkBySourceSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const rows = await getReworkBySourceStage(filters);
  return (
    <SectionCard title={t("reworkBySource.title")} subtitle={t("reworkBySource.description")}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("reworkBySource.noData")}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 border-b border-border pb-2 text-sm font-semibold">
            <div>{t("reworkBySource.stageHeader")}</div>
            <div className="text-center">{t("reworkBySource.internal")}</div>
            <div className="text-center">{t("reworkBySource.client")}</div>
          </div>
          {rows.map((r) => (
            <div key={r.stageId} className="grid grid-cols-3 items-center gap-2 text-sm">
              <div className="truncate font-medium">{r.stageName}</div>
              <div className="text-center font-medium text-success">{r.internal}</div>
              <div className="text-center font-medium text-danger">{r.client}</div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">{t("reworkBySource.legend")}</p>
    </SectionCard>
  );
}

async function QualityIssuesSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const reworkRateByStage = await loadRework(filters);
  const qualityIssues = reworkRateByStage.filter((s) => s.reworkRate > 0.1);

  if (qualityIssues.length === 0) return null;

  return (
    <section className="rounded-xl border border-danger/40 bg-card shadow-sm">
      <div className="flex items-start gap-3 border-b border-border p-6">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-danger-subtle text-danger">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-foreground">{t("qualityIssues.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("qualityIssues.description")}</p>
        </div>
      </div>
      <div className="space-y-2 p-6">
        {qualityIssues.map((stage) => (
          <div
            key={stage.stageId}
            className="flex items-center justify-between rounded-lg border border-danger/40 bg-danger-subtle p-3"
          >
            <div>
              <div className="font-medium text-foreground">{stage.stageName}</div>
              <div className="text-xs text-muted-foreground">
                {stage.templateName} • {stage.completed} {t("qualityIssues.completed")},{" "}
                {stage.reverted} {t("qualityIssues.reverted")}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums text-danger">
                {(stage.reworkRate * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-muted-foreground">{t("qualityIssues.rework")}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Team (historical) — folded in from the former /reports/team-productivity ──

async function TeamOnTimeSection({ range }: { range: PeriodRange }) {
  const data = await getOnTimeRate(range);
  return <OnTimeRateCard data={data} />;
}

async function TeamThroughputSection({ range }: { range: PeriodRange }) {
  const rows = await getTeamThroughput(range);
  return <ThroughputTable rows={rows} />;
}

async function TeamStageDurationSection({ range }: { range: PeriodRange }) {
  const rows = await getStageDuration(range);
  return <StageDurationTable rows={rows} />;
}

export default async function PerformanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Check authorization
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const params = await searchParams;

  const { monthStr, teamId, clientId, projectId, templateId, startDate, endDate, hasFilters } =
    parseReportFilters(params);

  // Stable reference so cache() dedupes the shared queries across sections.
  const filters: PerformanceFilters = {
    startDate,
    endDate,
    teamId,
    clientId,
    projectId,
    templateId,
  };

  // The team (historical) widgets take an explicit {from,to}. Reuse the selected
  // month window when present; otherwise default to the trailing 30 days.
  const now = new Date();
  const teamRange: PeriodRange = {
    from: startDate ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    to: endDate ?? now,
  };

  const [t, months] = await Promise.all([
    getTranslations("reportsPerformance"),
    getAvailablePerformanceMonths(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={t("subtitle")}
        backHref="/reports"
        backLabel={t("back")}
      />

      <div className="space-y-6">
        {/* Filters */}
        <ReportFilterBar
          basePath="/reports/performance"
          namespace="reportsPerformance"
          months={months}
          month={monthStr}
          teamId={teamId}
          clientId={clientId}
          projectId={projectId}
          templateId={templateId}
          includeTemplate
          hasFilters={hasFilters}
        />

        {/* Lead Time Metrics */}
        <Suspense fallback={<MetricsSkeleton />}>
          <LeadTimeSection filters={filters} t={t} />
        </Suspense>

        {/* Cycle-time percentiles (forecast basis) */}
        <Suspense fallback={<CardSkeleton />}>
          <CycleTimeSection filters={filters} t={t} />
        </Suspense>

        {/* Monte Carlo delivery forecast */}
        <Suspense fallback={<CardSkeleton />}>
          <ForecastSection filters={filters} t={t} />
        </Suspense>

        {/* Time-series: throughput trend + status CFD */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<CardSkeleton />}>
            <ThroughputSection filters={filters} t={t} />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <CfdSection filters={filters} t={t} />
          </Suspense>
        </div>

        {/* Bottlenecks Alert */}
        <Suspense fallback={null}>
          <BottlenecksSection filters={filters} t={t} />
        </Suspense>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<CardSkeleton />}>
            <AvgTimeSection filters={filters} t={t} />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <FlowEfficiencySection filters={filters} t={t} />
          </Suspense>
        </div>

        <Suspense fallback={<CardSkeleton />}>
          <ReworkSection filters={filters} t={t} />
        </Suspense>

        {/* Process signals: first-time-right and rework by source stage */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<CardSkeleton />}>
            <FirstTimeRightSection filters={filters} t={t} />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <ReworkBySourceSection filters={filters} t={t} />
          </Suspense>
        </div>

        {/* Quality Issues Alert */}
        <Suspense fallback={null}>
          <QualityIssuesSection filters={filters} t={t} />
        </Suspense>

        {/* ── Team (historical) — folded in from team-productivity (§3.3) ── */}
        <div className="flex items-center gap-3 pt-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {t("team.heading")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("team.subtitle")}</p>
          </div>
        </div>

        <Suspense fallback={<CardSkeleton />}>
          <TeamOnTimeSection range={teamRange} />
        </Suspense>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Suspense fallback={<CardSkeleton />}>
            <TeamThroughputSection range={teamRange} />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <TeamStageDurationSection range={teamRange} />
          </Suspense>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" />
          {t("team.rangeNote")}
        </p>
      </div>
    </div>
  );
}
