import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { CalendarDays, Trash2, Users, AlertTriangle } from "lucide-react";
import { requireManagerOrAdmin } from "@/lib/permissions";
import {
  getOccurrencesInRange,
  getMaterializedYears,
  deleteOccurrence,
} from "@/lib/actions/calendar-occurrence";
import { getWeeklyCoverage } from "@/lib/actions/weekly-coverage";
import { getProjectsForSelect, getTemplatesForSelect } from "@/lib/actions/task";
import { getClients } from "@/lib/actions/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { todayInSaoPaulo, formatISODate, mondayOfWeek } from "@/lib/dates";
import { planningHorizon } from "@/lib/calendar/horizon";
import { parseWeekWindow } from "@/lib/calendar/weekly-window";
import { OccurrenceForm } from "./OccurrenceForm";
import { MaterializeYearButton } from "./MaterializeYearButton";
import { WeekBlock } from "./WeekBlock";
import { WeekWindowToggle } from "./WeekWindowToggle";

export const metadata: Metadata = { title: "Planejamento de datas" };

export default async function PlanningDatesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const sp = await searchParams;
  const weeks = parseWeekWindow(sp.weeks);

  const today = todayInSaoPaulo();
  const { start, end } = planningHorizon(today);
  const currentMonday = formatISODate(mondayOfWeek(today));

  const [t, locale, coverage, occurrences, materialized, rawProjects, rawTemplates, clients] =
    await Promise.all([
      getTranslations("planning.dates"),
      getLocale(),
      getWeeklyCoverage(weeks),
      getOccurrencesInRange({ start, end }),
      getMaterializedYears(),
      getProjectsForSelect(),
      getTemplatesForSelect(),
      getClients(),
    ]);

  const isEs = locale.startsWith("es");
  const projects = rawProjects.map((p) => ({
    id: p.id,
    name: p.name,
    clientId: p.clientId,
    clientName: p.client.name,
  }));
  const templates = rawTemplates.map((tpl) => ({ id: tpl.id, name: tpl.name }));

  const total = coverage.activeClients.length;
  const weeksWithGap = coverage.weeks.filter((w) => w.idle.length > 0).length;
  const year = today.getUTCFullYear();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <WeekWindowToggle current={weeks} />
            <OccurrenceForm minDate={formatISODate(start)} maxDate={formatISODate(end)} />
          </div>
        }
      />

      <div className="space-y-6">
        {/* O que a tela responde de relance — sobre CLIENTES, não sobre datas. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile icon={Users} label={t("stats.activeClients")} value={String(total)} />
          <StatTile
            icon={AlertTriangle}
            label={t("stats.idleWindow")}
            value={String(coverage.idleAllWindow.length)}
            hint={t("stats.idleWindowHint", { weeks })}
            tone={coverage.idleAllWindow.length > 0 ? "warning" : "info"}
          />
          <StatTile
            icon={CalendarDays}
            label={t("stats.weeksWithGap")}
            value={`${weeksWithGap}/${weeks}`}
            hint={t("stats.weeksWithGapHint")}
          />
        </div>

        {/* Ociosidade sustentada: quem não tem NADA na janela inteira. É um
            problema diferente de ter uma semana vazia, e por isso vem separado. */}
        {coverage.idleAllWindow.length > 0 && (
          <SectionCard title={t("idleAll.title")} subtitle={t("idleAll.subtitle", { weeks })}>
            <div className="flex flex-wrap gap-1.5">
              {coverage.idleAllWindow.map((c) => (
                <StatusBadge key={c.id} tone="warning" label={c.name} />
              ))}
            </div>
          </SectionCard>
        )}

        <SectionCard title={t("weekly.title")} subtitle={t("weekly.subtitle")} bodyClassName="p-0">
          {total === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                title={t("weekly.noClients")}
                description={t("weekly.noClientsHint")}
              />
            </div>
          ) : (
            <div>
              {coverage.weeks.map((w) => (
                <WeekBlock
                  key={w.key}
                  week={w}
                  totalClients={total}
                  isCurrent={w.key === currentMonday}
                  isEs={isEs}
                  clients={clients}
                  projects={projects}
                  templates={templates}
                  locale={locale}
                />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Gestão do calendário: necessária, mas não é o assunto da tela. Fica
            no rodapé para não competir com a leitura de ociosidade. */}
        <SectionCard title={t("catalog.title")} subtitle={t("catalog.subtitle")}>
          <div className="mb-4 flex flex-wrap gap-2">
            {[year, year + 1].map((y) => (
              <MaterializeYearButton key={y} year={y} done={materialized.includes(y)} />
            ))}
          </div>

          {occurrences.filter((o) => o.source === "CUSTOM").length > 0 && (
            <div className="space-y-1 border-t border-border pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("catalog.ownDates")}
              </p>
              {occurrences
                .filter((o) => o.source === "CUSTOM")
                .map((o) => (
                  <div key={o.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-28 shrink-0 tabular-nums text-muted-foreground">
                      {o.iso}
                    </span>
                    <span className="flex-1 font-medium text-foreground">
                      {isEs ? o.titleEs : o.titlePt}
                    </span>
                    <OccurrenceForm
                      minDate={formatISODate(start)}
                      maxDate={formatISODate(end)}
                      draft={{
                        id: o.id,
                        iso: o.iso,
                        titlePt: o.titlePt,
                        titleEs: o.titleEs,
                        kind: o.kind,
                      }}
                    />
                    <ConfirmActionButton
                      action={async () => {
                        "use server";
                        const fd = new FormData();
                        fd.set("id", o.id);
                        await deleteOccurrence(fd);
                      }}
                      title={t("deleteTitle")}
                      description={t("deleteDescription", { title: o.titlePt, count: o.taskCount })}
                      confirmLabel={t("deleteConfirm")}
                      cancelLabel={t("cancel")}
                      confirmVariant="destructive"
                      trigger={
                        <button
                          type="button"
                          aria-label={t("delete")}
                          title={t("delete")}
                          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      }
                    />
                  </div>
                ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "info",
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  hint?: string;
  tone?: "info" | "warning";
}) {
  const chip = tone === "warning" ? "bg-warning-subtle text-warning" : "bg-primary/10 text-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${chip}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}
