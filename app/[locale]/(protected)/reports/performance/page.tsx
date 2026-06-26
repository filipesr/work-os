import { Suspense, cache } from "react";
import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import {
  getAverageTimePerStage,
  getReworkRateByStage,
  getLeadTimeMetrics,
  getAvailablePerformanceMonths,
  type PerformanceFilters,
} from "@/lib/actions/reporting";
import { getTeamsForFilter, getProjectsForSelect } from "@/lib/actions/task";
import { getClients } from "@/lib/actions/client";
import { currentMonthSaoPaulo, monthRangeSaoPaulo, formatMonthLabel } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, TrendingDown, AlertTriangle, Timer, Activity } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";

// Dedupe queries shared across two layout positions each (alert + table) so they
// run once per request while still streaming in their own Suspense boundaries.
const loadAvgTime = cache((filters: PerformanceFilters) => getAverageTimePerStage(filters));
const loadRework = cache((filters: PerformanceFilters) => getReworkRateByStage(filters));

type T = Awaited<ReturnType<typeof getTranslations>>;

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="h-12 bg-muted rounded animate-pulse" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-40 bg-muted rounded animate-pulse" />
      </CardHeader>
      <CardContent>
        <div className="h-24 bg-muted rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5" />
          <CardTitle>{t("avgTimePerStage.title")}</CardTitle>
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
    await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);
  } catch {
    redirect("/auth/signin");
  }

  const params = await searchParams;

  // Parse filter parameters
  const rawMonth = typeof params.month === "string" ? params.month : undefined;
  const teamId = typeof params.teamId === "string" && params.teamId ? params.teamId : undefined;
  const clientId =
    typeof params.clientId === "string" && params.clientId ? params.clientId : undefined;
  const projectId =
    typeof params.projectId === "string" && params.projectId ? params.projectId : undefined;

  // Default to the current month (SP) even when no data exists yet.
  const monthStr = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentMonthSaoPaulo();
  const { start: startDate, end: endDate } = monthRangeSaoPaulo(monthStr);

  // Stable reference so cache() dedupes the shared queries across sections.
  const filters: PerformanceFilters = { startDate, endDate, teamId, clientId, projectId };

  const [t, locale, months, teams, clients, projects] = await Promise.all([
    getTranslations("reportsPerformance"),
    getLocale(),
    getAvailablePerformanceMonths(),
    getTeamsForFilter(),
    getClients(),
    getProjectsForSelect(),
  ]);
  const hasFilters = Boolean(rawMonth || teamId || clientId || projectId);

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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("filters.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* key remounts the uncontrolled selects when the active filters change
              (incl. "Limpar"), so their displayed values reset to the new defaults. */}
          <form
            method="GET"
            key={`${monthStr}|${teamId ?? ""}|${clientId ?? ""}|${projectId ?? ""}`}
            className="flex flex-wrap gap-4 items-end"
          >
            <div className="min-w-[160px]">
              <label htmlFor="month" className="block text-sm font-semibold text-foreground mb-2">
                {t("filters.month")}
              </label>
              <select
                id="month"
                name="month"
                defaultValue={monthStr}
                className="w-full h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthLabel(m, locale)}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[160px] flex-1">
              <label htmlFor="teamId" className="block text-sm font-semibold text-foreground mb-2">
                {t("filters.team")}
              </label>
              <select
                id="teamId"
                name="teamId"
                defaultValue={teamId ?? ""}
                className="w-full h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
              >
                <option value="">{t("filters.allTeams")}</option>
                {teams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[160px] flex-1">
              <label
                htmlFor="clientId"
                className="block text-sm font-semibold text-foreground mb-2"
              >
                {t("filters.client")}
              </label>
              <select
                id="clientId"
                name="clientId"
                defaultValue={clientId ?? ""}
                className="w-full h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
              >
                <option value="">{t("filters.allClients")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px] flex-1">
              <label
                htmlFor="projectId"
                className="block text-sm font-semibold text-foreground mb-2"
              >
                {t("filters.project")}
              </label>
              <select
                id="projectId"
                name="projectId"
                defaultValue={projectId ?? ""}
                className="w-full h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
              >
                <option value="">{t("filters.allProjects")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.client.name} - {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="h-11 px-6 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              {t("filters.filter")}
            </button>
            {hasFilters && (
              <Link
                href="/reports/performance"
                className="h-11 inline-flex items-center px-6 border-2 border-input-border rounded-lg hover:bg-muted transition-all duration-200"
              >
                {t("filters.clear")}
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

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
