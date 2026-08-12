import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { CalendarDays, Trash2, Users, Target } from "lucide-react";
import { requireManagerOrAdmin } from "@/lib/permissions";
import {
  getOccurrencesInRange,
  getMaterializedYears,
  getActiveClientCount,
  deleteOccurrence,
} from "@/lib/actions/calendar-occurrence";
import { getProjectsForSelect, getTemplatesForSelect } from "@/lib/actions/task";
import { getClients } from "@/lib/actions/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { todayInSaoPaulo } from "@/lib/dates";
import { OccurrenceForm } from "./OccurrenceForm";
import { MaterializeYearButton } from "./MaterializeYearButton";
import { CreateDemandButton } from "./CreateDemandButton";

export const metadata: Metadata = { title: "Datas do calendário" };

/** De hoje ao fim do ano que vem. Data passada é histórico: não dá para agir
 *  sobre ela, e enchia a lista empurrando o que importa para baixo. */
function horizon(today: Date) {
  const year = today.getUTCFullYear();
  return { start: today, end: new Date(Date.UTC(year + 1, 11, 31)), year };
}

const kindTone = (kind: string) =>
  kind === "HOLIDAY" ? "neutral" : kind === "COMMERCIAL" ? "info" : "success";

/** Cobertura → tom. Zero cliente numa data que já chegou é o único alarme;
 *  cobertura parcial é o estado normal de quem ainda está planejando. */
const coverageTone = (covered: number, total: number) => {
  if (total === 0 || covered === 0) return "neutral";
  return covered >= total ? "success" : "warning";
};

export default async function CalendarDatesPage() {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const today = todayInSaoPaulo();
  const { start, end, year } = horizon(today);

  const [t, locale, occurrences, materialized, activeClients, rawProjects, rawTemplates, clients] =
    await Promise.all([
      getTranslations("planning.dates"),
      getLocale(),
      getOccurrencesInRange({ start, end }),
      getMaterializedYears(),
      getActiveClientCount(),
      getProjectsForSelect(),
      getTemplatesForSelect(),
      getClients(),
    ]);

  const isEs = locale.startsWith("es");
  const fmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const projects = rawProjects.map((p) => ({
    id: p.id,
    name: p.name,
    clientId: p.clientId,
    clientName: p.client.name,
  }));
  const templates = rawTemplates.map((tpl) => ({ id: tpl.id, name: tpl.name }));

  // Resumo da janela: quantas datas já têm alguém e quantas estão zeradas.
  const covered = occurrences.filter((o) => o.coveredClients > 0).length;
  const uncovered = occurrences.length - covered;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<OccurrenceForm />}
      />

      <div className="space-y-6">
        {/* Estatística da janela — a leitura que a tela devia dar de relance. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            icon={CalendarDays}
            label={t("stats.dates")}
            value={String(occurrences.length)}
          />
          <StatTile
            icon={Target}
            label={t("stats.covered")}
            value={`${covered}/${occurrences.length}`}
            hint={uncovered > 0 ? t("stats.uncoveredHint", { count: uncovered }) : undefined}
          />
          <StatTile
            icon={Users}
            label={t("stats.activeClients")}
            value={String(activeClients)}
            hint={t("stats.activeClientsHint")}
          />
        </div>

        <SectionCard title={t("catalog.title")} subtitle={t("catalog.subtitle")}>
          <div className="flex flex-wrap gap-2">
            {[year, year + 1].map((y) => (
              <MaterializeYearButton key={y} year={y} done={materialized.includes(y)} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title={t("listTitle")} bodyClassName="p-0">
          {occurrences.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={CalendarDays} title={t("title")} description={t("empty")} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted">
                  <tr>
                    <Th>{t("columns.date")}</Th>
                    <Th>{t("columns.name")}</Th>
                    <Th>{t("columns.kind")}</Th>
                    <Th>{t("columns.coverage")}</Th>
                    <Th className="text-right">{t("columns.actions")}</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {occurrences.map((o) => (
                    <tr key={o.id} className="transition-colors hover:bg-accent">
                      <td className="whitespace-nowrap px-6 py-3 text-sm tabular-nums text-muted-foreground">
                        {fmt.format(new Date(`${o.iso}T00:00:00Z`))}
                      </td>
                      <td className="px-6 py-3">
                        <span className="font-medium text-foreground">
                          {isEs ? o.titleEs : o.titlePt}
                        </span>
                        {o.source === "CUSTOM" && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t("source.CUSTOM")}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <StatusBadge tone={kindTone(o.kind)} label={t(`kind.${o.kind}`)} />
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        {/* Clientes DISTINTOS, não demandas: dez demandas de um
                            cliente só não é cobertura, é concentração. */}
                        <StatusBadge
                          tone={coverageTone(o.coveredClients, activeClients)}
                          label={t("coverage", {
                            covered: o.coveredClients,
                            total: activeClients,
                          })}
                        />
                        {o.taskCount > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t("linkedTasks", { count: o.taskCount })}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <CreateDemandButton
                            occurrenceId={o.id}
                            date={o.iso}
                            eventTitle={isEs ? o.titleEs : o.titlePt}
                            clients={clients}
                            projects={projects}
                            templates={templates}
                          />
                          {/* Só as próprias são editáveis: uma edição no catálogo
                              seria desfeita na próxima rematerialização. */}
                          {o.source === "CUSTOM" && (
                            <>
                              <OccurrenceForm
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
                                description={t("deleteDescription", {
                                  title: o.titlePt,
                                  count: o.taskCount,
                                })}
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
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-foreground ${className}`}
    >
      {children}
    </th>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
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
