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
import { todayInSaoPaulo } from "@/lib/dates";
import { OccurrenceForm } from "./OccurrenceForm";
import { MaterializeYearButton } from "./MaterializeYearButton";

export const metadata: Metadata = { title: "Datas do calendário" };

/** Do início do ano corrente ao fim do próximo: o horizonte que a operação
 *  planeja. Datas mais antigas viram histórico e não precisam desta tela. */
function horizon(today: Date) {
  const year = today.getUTCFullYear();
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 11, 31)),
    year,
  };
}

export default async function CalendarDatesPage() {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const today = todayInSaoPaulo();
  const { start, end, year } = horizon(today);

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

  const kindTone = (kind: string) =>
    kind === "HOLIDAY" ? "neutral" : kind === "COMMERCIAL" ? "info" : "success";

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<OccurrenceForm />}
      />

      {/* Materialização do catálogo. Fica no topo porque numa base nova a tela
          começa vazia — sem este botão, não haveria nem por onde começar. */}
      <SectionCard title={t("catalog.title")} subtitle={t("catalog.subtitle")} className="mb-6">
        <div className="flex flex-wrap gap-2">
          {[year, year + 1].map((y) => (
            <MaterializeYearButton key={y} year={y} done={materialized.includes(y)} />
          ))}
        </div>
      </SectionCard>

      {occurrences.length === 0 ? (
        <EmptyState
          variant="card"
          icon={CalendarDays}
          title={t("title")}
          description={t("empty")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <ul className="divide-y divide-border">
            {occurrences.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <span className="w-32 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                  {fmt.format(new Date(`${o.iso}T00:00:00Z`))}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {isEs ? o.titleEs : o.titlePt}
                </span>
                <StatusBadge tone={kindTone(o.kind)} label={t(`kind.${o.kind}`)} />
                {/* Distinguir a origem importa: só as próprias são editáveis, e
                    o usuário precisa entender por que o lápis some nas outras. */}
                <StatusBadge
                  tone="neutral"
                  label={o.source === "CURATED" ? t("source.CURATED") : t("source.CUSTOM")}
                />
                <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                  {t("linkedTasks", { count: o.taskCount })}
                </span>
                <span className="flex w-16 shrink-0 items-center justify-end gap-1">
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
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
