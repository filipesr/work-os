import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getTranslations, getLocale } from "next-intl/server";
import { getMonthlyCalendarDemands, getTeamAnniversaries } from "@/lib/actions/reporting";
import { getOccurrencesInRange } from "@/lib/actions/calendar-occurrence";
import { parseMonthParam, monthRangeFromFirst, formatISODate, todayInSaoPaulo } from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarToolbar } from "../CalendarToolbar";
import { PlanningModeBanner } from "../PlanningModeBanner";
import { MonthlyCalendar } from "@/components/planning/calendar/MonthlyCalendar";
import type {
  DayAnniversaries,
  MonthDay,
  MonthEvent,
} from "@/components/planning/calendar/monthly-types";
import { MonthGridSkeleton } from "../skeletons";
import {
  NO_CREATE_OPTIONS,
  loadCreateOptions,
  loadFilterOptions,
  type CalendarSearchParams,
} from "../shared";

export const metadata: Metadata = { title: "Mensal" };

/**
 * Só a GRADE fica atrás do Suspense: é a parte cara (demandas do mês,
 * aniversários, ocorrências) e a única que muda ao navegar de período.
 *
 * Cabeçalho e filtros ficam fora de propósito. Se entrassem, piscariam a cada
 * clique de mês — e ver o próprio filtro sumir e voltar passa a sensação de que
 * a tela recarregou, quando só o conteúdo mudou.
 */
async function MonthGrid({
  params,
  planning,
  first,
  isEs,
}: {
  params: CalendarSearchParams;
  planning: boolean;
  first: Date;
  isEs: boolean;
}) {
  const range = monthRangeFromFirst(first);
  const todayIso = formatISODate(todayInSaoPaulo());

  const [demandsByDay, people, createOptions, rawEvents] = await Promise.all([
    getMonthlyCalendarDemands(
      { start: range.gridStart, end: range.gridEnd },
      {
        teamId: params.team || undefined,
        projectId: params.project || undefined,
        userId: params.user || undefined,
        showCompleted: params.showCompleted === "1",
      }
    ),
    getTeamAnniversaries(),
    // Mesma regra da semana: sem trava de planejamento o diálogo de criação não
    // abre, então as três consultas de cliente/projeto/template não têm razão de
    // acontecer.
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

  return (
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
  );
}

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

  const first = parseMonthParam(params.month);

  // O casco espera só o barato: traduções, locale e as opções de filtro — três
  // consultas simples que NÃO dependem do mês. A grade, que é a parte cara, fica
  // atrás do Suspense e chega depois.
  const [t, locale, options] = await Promise.all([
    getTranslations("reportsCalendar"),
    getLocale(),
    loadFilterOptions(params.team, params.user),
  ]);
  const isEs = locale.startsWith("es");

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
        <CalendarToolbar
          view="month"
          anchor={first}
          periodLabel={monthLabel}
          planning={planning}
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
        <PlanningModeBanner enabled={planning} />

        {/* A CHAVE é o que faz o esqueleto reaparecer ao trocar de mês. Sem ela o
            React reaproveita a subárvore e a pessoa fica olhando o mês anterior,
            sem sinal nenhum, até o novo chegar. Os filtros entram na chave porque
            mudá-los também troca o conteúdo da grade. */}
        <Suspense
          key={`${formatISODate(first)}|${params.team ?? ""}|${params.project ?? ""}|${params.user ?? ""}|${showCompleted}`}
          fallback={<MonthGridSkeleton />}
        >
          <MonthGrid params={params} planning={planning} first={first} isEs={isEs} />
        </Suspense>
      </div>
    </div>
  );
}
