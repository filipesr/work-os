import { Suspense, cache } from "react";
import Link from "next/link";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { redirect } from "next/navigation";
import {
  getAverageTimePerStage,
  getReworkRateByStage,
  getLeadTimeMetrics,
  getAvailablePerformanceMonths,
  type PerformanceFilters,
} from "@/lib/actions/reporting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, TrendingDown, AlertTriangle, Timer, Activity } from "lucide-react";
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

async function LeadTimeSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const leadTimeMetrics = await getLeadTimeMetrics(filters);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-full">
              <Timer className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {t("leadTimeMetrics.average")}
              </p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {leadTimeMetrics.averageLeadTimeDays.toFixed(1)} {t("leadTimeMetrics.days")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-500/20 rounded-full">
              <Activity className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-emerald-700 dark:text-emerald-300">
                {t("leadTimeMetrics.median")}
              </p>
              <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                {leadTimeMetrics.medianLeadTimeDays.toFixed(1)} {t("leadTimeMetrics.days")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950 dark:to-violet-900">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-violet-500/20 rounded-full">
              <TrendingDown className="h-6 w-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-sm text-violet-700 dark:text-violet-300">
                {t("leadTimeMetrics.count")}
              </p>
              <p className="text-2xl font-bold text-violet-900 dark:text-violet-100">
                {leadTimeMetrics.count}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

async function BottlenecksSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const averageTimePerStage = await loadAvgTime(filters);
  const bottlenecks = averageTimePerStage.slice(0, 3);

  if (bottlenecks.length === 0) return null;

  return (
    <Card className="border-2 border-amber-400 dark:border-amber-500 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <CardTitle className="text-amber-700 dark:text-amber-300">
            {t("bottlenecks.title")}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
          {t("bottlenecks.description")}
        </p>
        <div className="space-y-2">
          {bottlenecks.map((stage) => (
            <div
              key={stage.stageId}
              className="flex justify-between items-center p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-700"
            >
              <div>
                <div className="font-medium text-amber-900 dark:text-amber-100">
                  {stage.stageName}
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  {stage.templateName} • {stage.count} {t("bottlenecks.occurrences")}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
                  {stage.averageDurationDays.toFixed(1)} {t("bottlenecks.days")}
                </div>
                <div className="text-xs text-amber-600 dark:text-amber-400">
                  {stage.averageDurationHours.toFixed(1)} {t("bottlenecks.hours")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            <CardTitle>{t("avgTimePerStage.title")}</CardTitle>
          </div>
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
        </div>
      </CardHeader>
      <CardContent>
        {averageTimePerStage.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("avgTimePerStage.noData")}</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 pb-2 border-b font-semibold text-sm">
              <div className="col-span-2">{t("avgTimePerStage.stageHeader")}</div>
              <div className="text-right">{t("avgTimePerStage.timeHeader")}</div>
            </div>
            {averageTimePerStage.map((stage) => (
              <div key={stage.stageId} className="grid grid-cols-3 gap-2 text-sm">
                <div className="col-span-2">
                  <div className="font-medium truncate">{stage.stageName}</div>
                  <div className="text-xs text-muted-foreground">
                    {stage.templateName} • {stage.count}x
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{stage.averageDurationDays.toFixed(1)}d</div>
                  <div className="text-xs text-muted-foreground">
                    {stage.averageDurationHours.toFixed(0)}h
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

async function ReworkSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const reworkRateByStage = await loadRework(filters);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          <CardTitle>{t("reworkRate.title")}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {reworkRateByStage.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("reworkRate.noData")}</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2 pb-2 border-b font-semibold text-sm">
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
                  className={`grid grid-cols-4 gap-2 text-sm p-2 rounded ${
                    isHighRework
                      ? "bg-rose-100 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700"
                      : ""
                  }`}
                >
                  <div className="col-span-2">
                    <div className="font-medium truncate">{stage.stageName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {stage.templateName}
                    </div>
                  </div>
                  <div className="text-center text-xs">
                    <div className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {stage.completed}
                    </div>
                    <div className="text-rose-600 dark:text-rose-400 font-medium">
                      {stage.reverted}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-bold ${
                        isHighRework ? "text-rose-700 dark:text-rose-300" : "text-foreground"
                      }`}
                    >
                      {reworkPercentage}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

async function QualityIssuesSection({ filters, t }: { filters: PerformanceFilters; t: T }) {
  const reworkRateByStage = await loadRework(filters);
  const qualityIssues = reworkRateByStage.filter((s) => s.reworkRate > 0.1);

  if (qualityIssues.length === 0) return null;

  return (
    <Card className="border-2 border-rose-400 dark:border-rose-500 bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-950 dark:to-red-950">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
          <CardTitle className="text-rose-700 dark:text-rose-300">
            {t("qualityIssues.title")}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-rose-700 dark:text-rose-300 mb-4">
          {t("qualityIssues.description")}
        </p>
        <div className="space-y-2">
          {qualityIssues.map((stage) => (
            <div
              key={stage.stageId}
              className="flex justify-between items-center p-3 bg-rose-100 dark:bg-rose-900/30 rounded-lg border border-rose-200 dark:border-rose-700"
            >
              <div>
                <div className="font-medium text-rose-900 dark:text-rose-100">
                  {stage.stageName}
                </div>
                <div className="text-xs text-rose-700 dark:text-rose-300">
                  {stage.templateName} • {stage.completed} {t("qualityIssues.completed")},{" "}
                  {stage.reverted} {t("qualityIssues.reverted")}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-rose-700 dark:text-rose-300">
                  {(stage.reworkRate * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-rose-600 dark:text-rose-400">
                  {t("qualityIssues.rework")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
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

  const { monthStr, teamId, clientId, projectId, startDate, endDate, hasFilters } =
    parseReportFilters(params);

  // Stable reference so cache() dedupes the shared queries across sections.
  const filters: PerformanceFilters = { startDate, endDate, teamId, clientId, projectId };

  const [t, months] = await Promise.all([
    getTranslations("reportsPerformance"),
    getAvailablePerformanceMonths(),
  ]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/reports" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-3xl font-bold">{t("title")}</h1>
          </div>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
      </div>

      {/* Filters */}
      <ReportFilterBar
        basePath="/reports/performance"
        namespace="reportsPerformance"
        months={months}
        month={monthStr}
        teamId={teamId}
        clientId={clientId}
        projectId={projectId}
        hasFilters={hasFilters}
      />

      {/* Lead Time Metrics */}
      <Suspense fallback={<MetricsSkeleton />}>
        <LeadTimeSection filters={filters} t={t} />
      </Suspense>

      {/* Bottlenecks Alert */}
      <Suspense fallback={null}>
        <BottlenecksSection filters={filters} t={t} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<CardSkeleton />}>
          <AvgTimeSection filters={filters} t={t} />
        </Suspense>
        <Suspense fallback={<CardSkeleton />}>
          <ReworkSection filters={filters} t={t} />
        </Suspense>
      </div>

      {/* Quality Issues Alert */}
      <Suspense fallback={null}>
        <QualityIssuesSection filters={filters} t={t} />
      </Suspense>
    </div>
  );
}
