import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { CalendarDays, Trash2 } from "lucide-react";
import { requireManagerOrAdmin } from "@/lib/permissions";
import {
  getOccurrencesInRange,
  getMaterializedYears,
  deleteOccurrence,
} from "@/lib/actions/calendar-occurrence";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { todayInSaoPaulo, formatISODate } from "@/lib/dates";
import { planningHorizon } from "@/lib/calendar/horizon";
import { OccurrenceForm } from "./OccurrenceForm";
import { MaterializeYearButton } from "./MaterializeYearButton";

export const metadata: Metadata = { title: "Datas do calendário" };

const kindTone = (kind: string) =>
  kind === "HOLIDAY" ? "neutral" : kind === "COMMERCIAL" ? "info" : "success";

/**
 * REGISTRO de datas: o catálogo de feriados/datas comerciais e as datas
 * próprias, com CRUD.
 *
 * Separada de `/planning/coverage` porque a dinâmica é oposta: aqui se mexe
 * poucas vezes por ano (gerar o ano, cadastrar uma feira); lá se olha toda
 * semana para agir. Misturar as duas fazia o cadastro competir com a leitura.
 */
export default async function CalendarDatesPage() {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const today = todayInSaoPaulo();
  const { start, end } = planningHorizon(today);
  const year = today.getUTCFullYear();

  const [t, locale, occurrences, materialized] = await Promise.all([
    getTranslations("planning.dates"),
    getLocale(),
    getOccurrencesInRange({ start, end }),
    getMaterializedYears(),
  ]);

  const isEs = locale.startsWith("es");
  const fmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const own = occurrences.filter((o) => o.source === "CUSTOM");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<OccurrenceForm minDate={formatISODate(start)} maxDate={formatISODate(end)} />}
      />

      <div className="space-y-6">
        <SectionCard title={t("catalog.title")} subtitle={t("catalog.subtitle")}>
          <div className="flex flex-wrap gap-2">
            {[year, year + 1].map((y) => (
              <MaterializeYearButton key={y} year={y} done={materialized.includes(y)} />
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title={t("listTitle")}
          subtitle={t("listSubtitle", { own: own.length, total: occurrences.length })}
          bodyClassName="p-0"
        >
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
                    <Th>{t("columns.origin")}</Th>
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
                        {o.taskCount > 0 && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t("linkedTasks", { count: o.taskCount })}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <StatusBadge tone={kindTone(o.kind)} label={t(`kind.${o.kind}`)} />
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <StatusBadge
                          tone="neutral"
                          label={o.source === "CURATED" ? t("source.CURATED") : t("source.CUSTOM")}
                        />
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-right">
                        {/* Só as próprias são editáveis: mexer numa do catálogo
                            seria desfeito na próxima rematerialização. */}
                        {o.source === "CUSTOM" ? (
                          <div className="inline-flex items-center gap-1">
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
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t("catalogReadOnly")}
                          </span>
                        )}
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
