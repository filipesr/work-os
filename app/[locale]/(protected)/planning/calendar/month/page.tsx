import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getTranslations, getLocale } from "next-intl/server";
import { getMonthlyCalendarDemands, getTeamAnniversaries } from "@/lib/actions/reporting";
import { getOccurrencesInRange } from "@/lib/actions/calendar-occurrence";
import { parseMonthParam, monthRangeFromFirst, formatISODate, todayInSaoPaulo } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarFiltersBar } from "../CalendarFiltersBar";
import { PlanningModeBanner } from "../PlanningModeBanner";
import { MonthlyCalendar } from "@/components/planning/calendar/MonthlyCalendar";
import type {
  DayAnniversaries,
  MonthDay,
  MonthEvent,
} from "@/components/planning/calendar/monthly-types";
import {
  ControlBar,
  NO_CREATE_OPTIONS,
  loadCreateOptions,
  loadFilterOptions,
  type CalendarSearchParams,
} from "../shared";

export const metadata: Metadata = { title: "Calendário — Eventos & Demandas" };

/**
 * Calendário MENSAL: contexto. Datas comemorativas, feriados e aniversários no
 * mesmo grid das demandas — é a tela de onde sai a campanha. A semanal é a de
 * execução; separá-las deixou cada uma carregar só o que mostra e ter um
 * esqueleto fiel (`loading.tsx` não enxerga searchParams, então uma tela só
 * desenhava sempre a grade da semana).
 */
export default async function MonthCalendarPage({
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
  const planning = params.plan === "1";
  const showCompleted = params.showCompleted === "1";

  const [t, locale] = await Promise.all([getTranslations("reportsCalendar"), getLocale()]);
  const isEs = locale.startsWith("es");

  const first = parseMonthParam(params.month);
  const range = monthRangeFromFirst(first);
  const todayIso = formatISODate(todayInSaoPaulo());

  const [demandsByDay, people, options, createOptions, rawEvents] = await Promise.all([
    getMonthlyCalendarDemands(
      { start: range.gridStart, end: range.gridEnd },
      {
        teamId: params.team || undefined,
        projectId: params.project || undefined,
        userId: params.user || undefined,
        showCompleted,
      }
    ),
    getTeamAnniversaries(),
    loadFilterOptions(params.team, params.user),
    // Mesma regra da semana: sem trava de planejamento o diálogo de criação não
    // abre, então as três consultas de cliente/projeto/template não têm razão de
    // acontecer. Antes esta visão as fazia em toda abertura.
    planning ? loadCreateOptions() : Promise.resolve(NO_CREATE_OPTIONS),
    // Lê do BANCO, não do catálogo em código: é o que faz uma data cadastrada à
    // mão (FestPop, feira local) aparecer na grade junto das datas curadas.
    getOccurrencesInRange({ start: range.gridStart, end: range.gridEnd }),
  ]);

  // Aniversários de idade e de contrato que caem em cada dia da grade (casados por mês/dia).
  const anniversariesByDay: Record<string, DayAnniversaries> = {};
  for (const d of range.gridDays) {
    const month = d.getUTCMonth();
    const day = d.getUTCDate();
    const year = d.getUTCFullYear();
    const birthdays: { name: string }[] = [];
    const workAnniversaries: { name: string; years: number }[] = [];
    for (const person of people) {
      const label = person.name || person.email || "—";
      if (
        person.birthday &&
        person.birthday.getUTCMonth() === month &&
        person.birthday.getUTCDate() === day
      ) {
        birthdays.push({ name: label });
      }
      if (
        person.admissionDate &&
        person.admissionDate.getUTCMonth() === month &&
        person.admissionDate.getUTCDate() === day
      ) {
        workAnniversaries.push({
          name: label,
          years: year - person.admissionDate.getUTCFullYear(),
        });
      }
    }
    if (birthdays.length > 0 || workAnniversaries.length > 0) {
      anniversariesByDay[formatISODate(d)] = { birthdays, workAnniversaries };
    }
  }

  const eventsByDay: Record<string, MonthEvent[]> = {};
  for (const e of rawEvents) {
    (eventsByDay[e.iso] ??= []).push({
      id: e.id,
      iso: e.iso,
      title: isEs ? e.titleEs : e.titlePt,
      countries: e.countries,
      // O tipo visual do pill segue o que já existia: feriado vs "comercial".
      // EVENT (data própria) entra como comercial — é oportunidade de campanha,
      // não folga.
      type: e.kind === "HOLIDAY" ? "holiday" : "commercial",
    });
  }

  const days: MonthDay[] = range.gridDays.map((d) => ({
    iso: formatISODate(d),
    day: d.getUTCDate(),
    inMonth: d.getUTCMonth() === first.getUTCMonth(),
    isToday: formatISODate(d) === todayIso,
  }));

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(first);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("monthly.title")}
        subtitle={t("monthly.subtitle")}
      />
      <div className="space-y-4">
        <ControlBar
          view="month"
          anchor={first}
          periodLabel={monthLabel}
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

        <MonthlyCalendar
          days={days}
          eventsByDay={eventsByDay}
          demandsByDay={demandsByDay}
          anniversariesByDay={anniversariesByDay}
          clients={createOptions.clients}
          projects={createOptions.projects}
          templates={createOptions.templates}
          planning={planning}
        />
      </div>
    </div>
  );
}
