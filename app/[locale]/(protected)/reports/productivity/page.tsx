import { Suspense, cache } from "react";
import Link from "next/link";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { redirect } from "next/navigation";
import {
  getHoursByUser,
  getHoursByProject,
  getHoursByClient,
  getHoursByStage,
  getAvailableTimeLogMonths,
  type ProductivityFilters,
} from "@/lib/actions/reporting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Clock, Users, Briefcase, Building2, Workflow } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { CardSkeleton, SummarySkeleton } from "@/components/reports/skeletons";
import { parseReportFilters } from "@/lib/reports/filters";

// Dedupe the user query across the summary banner and the "Hours by User" card
// (both need it, in different layout positions) so it runs once per request.
const loadHoursByUser = cache((filters: ProductivityFilters) => getHoursByUser(filters));

type T = Awaited<ReturnType<typeof getTranslations>>;

async function SummarySection({ filters, t }: { filters: ProductivityFilters; t: T }) {
  const hoursByUser = await loadHoursByUser(filters);
  const totalHours = hoursByUser.reduce((sum, u) => sum + u.totalHours, 0);

  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-indigo-50 dark:from-indigo-950 dark:to-indigo-950">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-500/20 rounded-full">
            <Clock className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-sm text-indigo-700 dark:text-indigo-300">{t("totalHours")}</p>
            <p className="text-3xl font-bold text-indigo-900 dark:text-indigo-100">
              {totalHours.toFixed(1)}h
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function HoursByUserSection({ filters, t }: { filters: ProductivityFilters; t: T }) {
  const hoursByUser = await loadHoursByUser(filters);

  const exportRows = hoursByUser.map((u) => ({
    user: u.userName || u.userEmail || "",
    hours: Number(u.totalHours.toFixed(1)),
  }));

  return (
    <Card className="border-l-4 border-l-sky-500 dark:border-l-sky-400">
      <CardHeader className="bg-gradient-to-r from-sky-50 to-transparent dark:from-sky-950 dark:to-transparent">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <CardTitle className="text-sky-900 dark:text-sky-100">
              {t("hoursByUser.title")}
            </CardTitle>
          </div>
          <ExportButtons
            filename="hours-by-user"
            title={t("hoursByUser.title")}
            columns={[
              { key: "user", header: t("hoursByUser.userHeader") },
              { key: "hours", header: t("hoursByUser.hoursHeader") },
            ]}
            rows={exportRows}
          />
        </div>
      </CardHeader>
      <CardContent>
        {hoursByUser.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hoursByUser.noData")}</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 pb-2 border-b font-semibold text-sm">
              <div>{t("hoursByUser.userHeader")}</div>
              <div className="text-right">{t("hoursByUser.hoursHeader")}</div>
              <div className="text-right">{t("hoursByUser.utilizationHeader")}</div>
            </div>
            {hoursByUser.map((user) => {
              const pct = user.utilization != null ? Math.round(user.utilization * 100) : null;
              // Indicative band (agency utilization benchmarks were not
              // adversarially verified) — a signal, not an alarm.
              const tone =
                pct == null
                  ? "text-muted-foreground"
                  : pct > 90
                    ? "text-danger"
                    : pct >= 60
                      ? "text-success"
                      : "text-warning";
              return (
                <div key={user.userId} className="grid grid-cols-3 gap-2 text-sm">
                  <div className="truncate">
                    {user.userName || user.userEmail || t("hoursByUser.noName")}
                  </div>
                  <div className="text-right font-medium">{user.totalHours.toFixed(1)}h</div>
                  <div className={`text-right font-medium ${tone}`}>
                    {pct != null ? `${pct}%` : "—"}
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

async function HoursByProjectSection({ filters, t }: { filters: ProductivityFilters; t: T }) {
  const hoursByProject = await getHoursByProject(filters);

  return (
    <Card className="border-l-4 border-l-teal-500 dark:border-l-teal-400">
      <CardHeader className="bg-gradient-to-r from-teal-50 to-transparent dark:from-teal-950 dark:to-transparent">
        <div className="flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          <CardTitle className="text-teal-900 dark:text-teal-100">
            {t("hoursByProject.title")}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {hoursByProject.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hoursByProject.noData")}</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 pb-2 border-b font-semibold text-sm">
              <div>{t("hoursByProject.projectHeader")}</div>
              <div className="text-right">{t("hoursByProject.hoursHeader")}</div>
            </div>
            {hoursByProject.map((project) => (
              <div key={project.projectId} className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="font-medium truncate">{project.projectName}</div>
                  <div className="text-xs text-muted-foreground truncate">{project.clientName}</div>
                </div>
                <div className="text-right font-medium">{project.totalHours.toFixed(1)}h</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

async function HoursByClientSection({ filters, t }: { filters: ProductivityFilters; t: T }) {
  const hoursByClient = await getHoursByClient(filters);

  return (
    <Card className="border-l-4 border-l-indigo-500 dark:border-l-indigo-400">
      <CardHeader className="bg-gradient-to-r from-indigo-50 to-transparent dark:from-indigo-950 dark:to-transparent">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <CardTitle className="text-indigo-900 dark:text-indigo-100">
            {t("hoursByClient.title")}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {hoursByClient.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hoursByClient.noData")}</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 pb-2 border-b font-semibold text-sm">
              <div>{t("hoursByClient.clientHeader")}</div>
              <div className="text-right">{t("hoursByClient.hoursHeader")}</div>
            </div>
            {hoursByClient.map((client) => (
              <div key={client.clientId} className="grid grid-cols-2 gap-2 text-sm">
                <div className="truncate">{client.clientName}</div>
                <div className="text-right font-medium">{client.totalHours.toFixed(1)}h</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

async function HoursByStageSection({ filters, t }: { filters: ProductivityFilters; t: T }) {
  const hoursByStage = await getHoursByStage(filters);

  return (
    <Card className="border-l-4 border-l-fuchsia-500 dark:border-l-fuchsia-400">
      <CardHeader className="bg-gradient-to-r from-fuchsia-50 to-transparent dark:from-fuchsia-950 dark:to-transparent">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-fuchsia-600 dark:text-fuchsia-400" />
          <CardTitle className="text-fuchsia-900 dark:text-fuchsia-100">
            {t("hoursByStage.title")}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {hoursByStage.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("hoursByStage.noData")}</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 pb-2 border-b font-semibold text-sm">
              <div>{t("hoursByStage.stageHeader")}</div>
              <div className="text-right">{t("hoursByStage.hoursHeader")}</div>
            </div>
            {hoursByStage.map((stage) => (
              <div key={stage.stageId} className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="font-medium truncate">{stage.stageName}</div>
                  <div className="text-xs text-muted-foreground truncate">{stage.templateName}</div>
                </div>
                <div className="text-right font-medium">{stage.totalHours.toFixed(1)}h</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function ProductivityReportPage({
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

  // Stable reference so cache() dedupes loadHoursByUser across sections.
  const filters: ProductivityFilters = { startDate, endDate, teamId, clientId, projectId };

  const [t, months] = await Promise.all([
    getTranslations("reportsProductivity"),
    getAvailableTimeLogMonths(),
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
        basePath="/reports/productivity"
        namespace="reportsProductivity"
        months={months}
        month={monthStr}
        teamId={teamId}
        clientId={clientId}
        projectId={projectId}
        hasFilters={hasFilters}
      />

      {/* Summary Card */}
      <Suspense fallback={<SummarySkeleton />}>
        <SummarySection filters={filters} t={t} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Suspense fallback={<CardSkeleton />}>
          <HoursByUserSection filters={filters} t={t} />
        </Suspense>
        {/* Hide the per-project breakdown when a single project is already filtered. */}
        {!projectId && (
          <Suspense fallback={<CardSkeleton />}>
            <HoursByProjectSection filters={filters} t={t} />
          </Suspense>
        )}
        {/* Hide the per-client breakdown when a single client is already filtered. */}
        {!clientId && (
          <Suspense fallback={<CardSkeleton />}>
            <HoursByClientSection filters={filters} t={t} />
          </Suspense>
        )}
        <Suspense fallback={<CardSkeleton />}>
          <HoursByStageSection filters={filters} t={t} />
        </Suspense>
      </div>
    </div>
  );
}
