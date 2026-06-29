import { Suspense, cache } from "react";
import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import {
  getHoursByUser,
  getHoursByProject,
  getHoursByClient,
  getHoursByStage,
  getAvailableTimeLogMonths,
  type ProductivityFilters,
} from "@/lib/actions/reporting";
import { getTeamsForFilter, getProjectsForSelect } from "@/lib/actions/task";
import { getClients } from "@/lib/actions/client";
import { currentMonthSaoPaulo, monthRangeSaoPaulo, formatMonthLabel } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Clock, Users, Briefcase, Building2, Workflow } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { ExportButtons } from "@/components/reports/ExportButtons";

// Dedupe the user query across the summary banner and the "Hours by User" card
// (both need it, in different layout positions) so it runs once per request.
const loadHoursByUser = cache((filters: ProductivityFilters) => getHoursByUser(filters));

type T = Awaited<ReturnType<typeof getTranslations>>;

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

function SummarySkeleton() {
  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950 dark:to-blue-950">
      <CardContent className="pt-6">
        <div className="h-12 w-48 bg-muted rounded animate-pulse" />
      </CardContent>
    </Card>
  );
}

async function SummarySection({ filters, t }: { filters: ProductivityFilters; t: T }) {
  const hoursByUser = await loadHoursByUser(filters);
  const totalHours = hoursByUser.reduce((sum, u) => sum + u.totalHours, 0);

  return (
    <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950 dark:to-blue-950">
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
            <div className="grid grid-cols-2 gap-2 pb-2 border-b font-semibold text-sm">
              <div>{t("hoursByUser.userHeader")}</div>
              <div className="text-right">{t("hoursByUser.hoursHeader")}</div>
            </div>
            {hoursByUser.map((user) => (
              <div key={user.userId} className="grid grid-cols-2 gap-2 text-sm">
                <div className="truncate">
                  {user.userName || user.userEmail || t("hoursByUser.noName")}
                </div>
                <div className="text-right font-medium">{user.totalHours.toFixed(1)}h</div>
              </div>
            ))}
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
    <Card className="border-l-4 border-l-purple-500 dark:border-l-purple-400">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-transparent dark:from-purple-950 dark:to-transparent">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <CardTitle className="text-purple-900 dark:text-purple-100">
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

  // Default to the current month (SP) even when no logs exist yet.
  const monthStr = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : currentMonthSaoPaulo();
  const { start: startDate, end: endDate } = monthRangeSaoPaulo(monthStr);

  // Stable reference so cache() dedupes loadHoursByUser across sections.
  const filters: ProductivityFilters = { startDate, endDate, teamId, clientId, projectId };

  const [t, locale, months, teams, clients, projects] = await Promise.all([
    getTranslations("reportsProductivity"),
    getLocale(),
    getAvailableTimeLogMonths(),
    getTeamsForFilter(),
    getClients(),
    getProjectsForSelect(),
  ]);
  // "Limpar" is meaningful only when a non-default filter is active.
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
                href="/reports/productivity"
                className="h-11 inline-flex items-center px-6 border-2 border-input-border rounded-lg hover:bg-muted transition-all duration-200"
              >
                {t("filters.clear")}
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

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
