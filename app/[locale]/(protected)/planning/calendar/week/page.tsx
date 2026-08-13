import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getTranslations, getLocale } from "next-intl/server";
import { getCalendarTasks } from "@/lib/actions/reporting";
import { parseWeekParam, weekRangeFromMonday } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarFiltersBar } from "../CalendarFiltersBar";
import { PlanningModeBanner } from "../PlanningModeBanner";
import { CalendarGrid } from "@/components/planning/calendar/CalendarGrid";
import { CalendarDndContext } from "@/components/planning/calendar/CalendarDndContext";
import {
  ControlBar,
  loadCreateOptions,
  loadFilterOptions,
  type CalendarSearchParams,
} from "../shared";

export const metadata: Metadata = { title: "Calendário — Semana" };

/**
 * Calendário SEMANAL: execução. Quem está com o quê nesta semana, com arraste
 * para reagendar. Não mostra datas comemorativas nem aniversários — para isso
 * existe a visão mensal, que é a tela de contexto.
 */
export default async function WeekCalendarPage({
  searchParams,
}: {
  searchParams: Promise<CalendarSearchParams>;
}) {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const params = await searchParams;
  // Trava de escrita na URL: sobrevive à navegação de período e à troca de
  // visão, então o gestor liga uma vez e planeja a rodada inteira.
  const planning = params.plan === "1";
  const showCompleted = params.showCompleted === "1";

  const [t, locale] = await Promise.all([getTranslations("reportsCalendar"), getLocale()]);
  const weekStart = parseWeekParam(params.week);
  const { end: weekEnd, days } = weekRangeFromMonday(weekStart);
  const dayDates = days.map((d) => d.toISOString());

  const [buckets, options, createOptions] = await Promise.all([
    getCalendarTasks({
      weekStart,
      weekEnd,
      teamId: params.team || undefined,
      projectId: params.project || undefined,
      userId: params.user || undefined,
      showCompleted,
    }),
    loadFilterOptions(params.team, params.user),
    // Só carrega o que alimenta o diálogo de criação quando ele pode abrir.
    planning ? loadCreateOptions() : Promise.resolve(null),
  ]);

  const fmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });
  const periodLabel = `${fmt.format(weekStart)} – ${fmt.format(weekEnd)}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader kicker={t("kicker")} title={t("title")} subtitle={t("subtitle")} />
      <div className="space-y-4">
        <ControlBar
          view="week"
          anchor={weekStart}
          periodLabel={periodLabel}
          planning={planning}
          filters={
            <CalendarFiltersBar
              teams={options.teams}
              projects={options.projects}
              users={options.userOptions}
              selected={{
                teamId: params.team,
                projectId: params.project,
                userId: options.validUserId,
                showCompleted,
              }}
            />
          }
        />
        <PlanningModeBanner enabled={planning} />

        <CalendarDndContext dayDates={dayDates} enabled={planning}>
          <CalendarGrid
            buckets={buckets}
            weekStart={weekStart}
            planning={planning}
            createOptions={createOptions ?? undefined}
          />
        </CalendarDndContext>
      </div>
    </div>
  );
}
