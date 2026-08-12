import { Suspense, cache } from "react";
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
import { Clock, Users, Briefcase, Building2, Workflow } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import { UtilizationMeter } from "@/components/reports/UtilizationMeter";
import { CardSkeleton, SummarySkeleton } from "@/components/reports/skeletons";
import { parseReportFilters } from "@/lib/reports/filters";
import { utilizationMeter } from "@/lib/team-health-format";
import {
  UTILIZATION_BAND,
  UTILIZATION_BAND_MIN,
  UTILIZATION_BAND_MAX,
  UTILIZATION_SCALE_MAX,
} from "@/lib/reporting-constants";

/** Chave i18n da posição na faixa (abaixo/dentro/acima) — rótulo, nunca cor. */
const meterPosition = (utilization: number) =>
  utilizationMeter(utilization, UTILIZATION_BAND).position;

// Dedupe the user query across the summary banner and the "Hours by User" card
// (both need it, in different layout positions) so it runs once per request.
const loadHoursByUser = cache((filters: ProductivityFilters) => getHoursByUser(filters));

type T = Awaited<ReturnType<typeof getTranslations>>;

async function SummarySection({ filters, t }: { filters: ProductivityFilters; t: T }) {
  const hoursByUser = await loadHoursByUser(filters);
  const totalHours = hoursByUser.reduce((sum, u) => sum + u.totalHours, 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Clock className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{t("totalHours")}</p>
          <p className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
            {totalHours.toFixed(1)}h
          </p>
        </div>
      </div>
    </div>
  );
}

async function HoursByUserSection({ filters, t }: { filters: ProductivityFilters; t: T }) {
  const hoursByUser = await loadHoursByUser(filters);

  const exportRows = hoursByUser.map((u) => ({
    user: u.userName || u.userEmail || "",
    hours: Number(u.totalHours.toFixed(1)),
    // Exportado como número puro; a faixa vive na tela, não na planilha — um
    // "%" solto numa coluna é o que mais facilmente vira ranking por engano.
    utilization: u.utilization != null ? `${Math.round(u.utilization * 100)}%` : "—",
  }));

  return (
    <SectionCard
      title={t("hoursByUser.title")}
      icon={Users}
      action={
        <ExportButtons
          filename="hours-by-user"
          title={t("hoursByUser.title")}
          columns={[
            { key: "user", header: t("hoursByUser.userHeader") },
            { key: "hours", header: t("hoursByUser.hoursHeader") },
            { key: "utilization", header: t("hoursByUser.utilizationHeader") },
          ]}
          rows={exportRows}
        />
      }
    >
      {hoursByUser.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("hoursByUser.noData")}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_5rem_11rem] gap-2 border-b border-border pb-2 text-sm font-semibold">
            <div>{t("hoursByUser.userHeader")}</div>
            <div className="text-right">{t("hoursByUser.hoursHeader")}</div>
            <div>{t("hoursByUser.utilizationHeader")}</div>
          </div>
          {hoursByUser.map((user) => (
            <div
              key={user.userId}
              className="grid grid-cols-[1fr_5rem_11rem] items-center gap-2 text-sm"
            >
              <div className="truncate">
                {user.userName || user.userEmail || t("hoursByUser.noName")}
              </div>
              <div className="text-right font-medium tabular-nums">
                {user.totalHours.toFixed(1)}h
              </div>
              {/* Faixa, não nota: a leitura está na posição do marcador. Nenhuma
                  cor de julgamento — estar fora da faixa é pauta de 1:1 (P7/P1). */}
              <UtilizationMeter
                utilization={user.utilization}
                emptyLabel={t("hoursByUser.utilizationEmpty")}
                bandLabel={
                  user.utilization == null
                    ? t("hoursByUser.utilizationEmpty")
                    : t(`hoursByUser.band.${meterPosition(user.utilization)}`, {
                        min: Math.round(UTILIZATION_BAND_MIN * 100),
                        max: Math.round(UTILIZATION_BAND_MAX * 100),
                      })
                }
              />
            </div>
          ))}
          {/* Legenda da régua: sem ela, o sombreado é decoração sem significado. */}
          <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
            <span className="flex-1">
              {t("hoursByUser.utilizationScale", {
                min: Math.round(UTILIZATION_BAND_MIN * 100),
                max: Math.round(UTILIZATION_BAND_MAX * 100),
                scale: Math.round(UTILIZATION_SCALE_MAX * 100),
              })}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">{t("hoursByUser.utilizationNote")}</p>
        </div>
      )}
    </SectionCard>
  );
}

async function HoursByProjectSection({ filters, t }: { filters: ProductivityFilters; t: T }) {
  const hoursByProject = await getHoursByProject(filters);

  const exportRows = hoursByProject.map((p) => ({
    project: p.projectName,
    client: p.clientName,
    hours: Number(p.totalHours.toFixed(1)),
  }));

  return (
    <SectionCard
      title={t("hoursByProject.title")}
      icon={Briefcase}
      action={
        <ExportButtons
          filename="hours-by-project"
          title={t("hoursByProject.title")}
          columns={[
            { key: "project", header: t("hoursByProject.projectHeader") },
            { key: "client", header: t("hoursByClient.clientHeader") },
            { key: "hours", header: t("hoursByProject.hoursHeader") },
          ]}
          rows={exportRows}
        />
      }
    >
      {hoursByProject.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("hoursByProject.noData")}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 border-b border-border pb-2 text-sm font-semibold">
            <div>{t("hoursByProject.projectHeader")}</div>
            <div className="text-right">{t("hoursByProject.hoursHeader")}</div>
          </div>
          {hoursByProject.map((project) => (
            <div key={project.projectId} className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="truncate font-medium">{project.projectName}</div>
                <div className="truncate text-xs text-muted-foreground">{project.clientName}</div>
              </div>
              <div className="text-right font-medium tabular-nums">
                {project.totalHours.toFixed(1)}h
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

async function HoursByClientSection({ filters, t }: { filters: ProductivityFilters; t: T }) {
  const hoursByClient = await getHoursByClient(filters);

  const exportRows = hoursByClient.map((c) => ({
    client: c.clientName,
    hours: Number(c.totalHours.toFixed(1)),
  }));

  return (
    <SectionCard
      title={t("hoursByClient.title")}
      icon={Building2}
      action={
        <ExportButtons
          filename="hours-by-client"
          title={t("hoursByClient.title")}
          columns={[
            { key: "client", header: t("hoursByClient.clientHeader") },
            { key: "hours", header: t("hoursByClient.hoursHeader") },
          ]}
          rows={exportRows}
        />
      }
    >
      {hoursByClient.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("hoursByClient.noData")}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 border-b border-border pb-2 text-sm font-semibold">
            <div>{t("hoursByClient.clientHeader")}</div>
            <div className="text-right">{t("hoursByClient.hoursHeader")}</div>
          </div>
          {hoursByClient.map((client) => (
            <div key={client.clientId} className="grid grid-cols-2 gap-2 text-sm">
              <div className="truncate">{client.clientName}</div>
              <div className="text-right font-medium tabular-nums">
                {client.totalHours.toFixed(1)}h
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

async function HoursByStageSection({ filters, t }: { filters: ProductivityFilters; t: T }) {
  const hoursByStage = await getHoursByStage(filters);

  const exportRows = hoursByStage.map((s) => ({
    stage: s.stageName,
    template: s.templateName,
    hours: Number(s.totalHours.toFixed(1)),
  }));

  return (
    <SectionCard
      title={t("hoursByStage.title")}
      icon={Workflow}
      action={
        <ExportButtons
          filename="hours-by-stage"
          title={t("hoursByStage.title")}
          columns={[
            { key: "stage", header: t("hoursByStage.stageHeader") },
            { key: "template", header: t("hoursByStage.templateHeader") },
            { key: "hours", header: t("hoursByStage.hoursHeader") },
          ]}
          rows={exportRows}
        />
      }
    >
      {hoursByStage.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("hoursByStage.noData")}</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 border-b border-border pb-2 text-sm font-semibold">
            <div>{t("hoursByStage.stageHeader")}</div>
            <div className="text-right">{t("hoursByStage.hoursHeader")}</div>
          </div>
          {hoursByStage.map((stage) => (
            <div key={stage.stageId} className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="truncate font-medium">{stage.stageName}</div>
                <div className="truncate text-xs text-muted-foreground">{stage.templateName}</div>
              </div>
              <div className="text-right font-medium tabular-nums">
                {stage.totalHours.toFixed(1)}h
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
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
          basePath="/reports/productivity"
          namespace="reportsProductivity"
          months={months}
          month={monthStr}
          teamId={teamId}
          clientId={clientId}
          projectId={projectId}
          hasFilters={hasFilters}
        />

        {/* Summary */}
        <Suspense fallback={<SummarySkeleton />}>
          <SummarySection filters={filters} t={t} />
        </Suspense>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
    </div>
  );
}
