import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getTranslations, getLocale } from "next-intl/server";
import prisma from "@/lib/prisma";
import {
  getCalendarTasks,
  getMonthlyCalendarDemands,
  getTeamAnniversaries,
} from "@/lib/actions/reporting";
import { getProjectsForSelect, getTemplatesForSelect } from "@/lib/actions/task";
import { getClients } from "@/lib/actions/client";
import { getOccurrencesInRange } from "@/lib/actions/calendar-occurrence";
import {
  parseWeekParam,
  weekRangeFromMonday,
  parseMonthParam,
  monthRangeFromFirst,
  formatISODate,
  todayInSaoPaulo,
} from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { PeriodNavigator } from "./PeriodNavigator";
import { CalendarFiltersBar } from "./CalendarFiltersBar";
import { CalendarViewToggle } from "./CalendarViewToggle";
import { PlanningModeToggle } from "./PlanningModeToggle";
import { PlanningModeBanner } from "./PlanningModeBanner";
import { CalendarGrid } from "@/components/planning/calendar/CalendarGrid";
import { CalendarDndContext } from "@/components/planning/calendar/CalendarDndContext";
import { MonthlyCalendar } from "@/components/planning/calendar/MonthlyCalendar";
import type {
  DayAnniversaries,
  MonthDay,
  MonthEvent,
} from "@/components/planning/calendar/monthly-types";

export const metadata: Metadata = {
  title: "Calendário",
};

interface PageProps {
  searchParams: Promise<{
    view?: string;
    week?: string;
    month?: string;
    team?: string;
    project?: string;
    user?: string;
    showCompleted?: string;
    plan?: string;
  }>;
}

/** Opções de time/projeto/pessoa da barra de filtros. A lista de pessoas segue o
 *  time selecionado; se o time mudar e a pessoa não pertencer mais a ele, a
 *  seleção é descartada em vez de filtrar por alguém invisível no seletor. */
async function loadFilterOptions(teamId?: string, selectedUserId?: string) {
  const [teams, projects, users] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: teamId ? { teams: { some: { id: teamId } } } : undefined,
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
  ]);
  const userOptions = users.map((u) => ({ id: u.id, name: u.name ?? u.email ?? u.id }));
  const validUserId =
    selectedUserId && userOptions.some((u) => u.id === selectedUserId) ? selectedUserId : undefined;
  return { teams, projects, userOptions, validUserId };
}

// A barra de controle é IDÊNTICA nas duas visões: alternância, navegação de
// período, trava de planejamento e filtros. Antes cada visão montava a sua, e a
// do mês descartava os filtros a cada clique de período.
function ControlBar({
  view,
  anchor,
  periodLabel,
  planning,
  filters,
}: {
  view: "week" | "month";
  anchor: Date;
  periodLabel: string;
  planning: boolean;
  filters: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 overflow-x-auto rounded-xl border border-border bg-card p-3 shadow-sm">
      <CalendarViewToggle view={view} />
      <PeriodNavigator view={view} anchor={anchor} label={periodLabel} />
      <div className="ml-auto flex items-center gap-3">
        {filters}
        <PlanningModeToggle enabled={planning} />
      </div>
    </div>
  );
}

// ─── Week mode ────────────────────────────────────────────────────────────────

async function WeekView({
  params,
  planning,
}: {
  params: Awaited<PageProps["searchParams"]>;
  planning: boolean;
}) {
  const locale = await getLocale();
  const weekStart = parseWeekParam(params.week);
  const { end: weekEnd, days } = weekRangeFromMonday(weekStart);
  const dayDates = days.map((d) => d.toISOString());
  const showCompleted = params.showCompleted === "1";

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
    <>
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
    </>
  );
}

// ─── Month mode (folded in from the former /reports/calendar/monthly) ─────────

/** Cliente/projeto/template do diálogo de criação em lote. */
async function loadCreateOptions() {
  const [rawProjects, rawTemplates, clients] = await Promise.all([
    getProjectsForSelect(),
    getTemplatesForSelect(),
    getClients(),
  ]);
  return {
    clients,
    projects: rawProjects.map((p) => ({
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      clientName: p.client.name,
    })),
    templates: rawTemplates.map((tpl) => ({ id: tpl.id, name: tpl.name })),
  };
}

async function MonthView({
  params,
  planning,
}: {
  params: Awaited<PageProps["searchParams"]>;
  planning: boolean;
}) {
  const locale = await getLocale();
  const isEs = locale.startsWith("es");

  const first = parseMonthParam(params.month);
  const range = monthRangeFromFirst(first);
  const todayIso = formatISODate(todayInSaoPaulo());
  const showCompleted = params.showCompleted === "1";

  // `rawEvents` entra aqui, e não numa busca depois do laço de aniversários:
  // depende só de `range`, que já existe acima. Fora do Promise.all virava uma
  // ida ao banco em SÉRIE — o laço no meio é CPU sobre dado já carregado e
  // escondia bem a cascata.
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
    loadCreateOptions(),
    // Lê do BANCO, não do catálogo em código: é o que faz uma data cadastrada à
    // mão (FestPop, feira local) aparecer na grade junto das datas curadas.
    getOccurrencesInRange({ start: range.gridStart, end: range.gridEnd }),
  ]);

  // Birthdays + contract anniversaries falling on each grid day (matched by month/day).
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
    <>
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
    </>
  );
}

export default async function CalendarPage({ searchParams }: PageProps) {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const params = await searchParams;
  const view = params.view === "month" ? "month" : "week";
  // Trava de escrita na URL: sobrevive à navegação de período e à troca de
  // visão, então o gestor liga uma vez e planeja a rodada inteira.
  const planning = params.plan === "1";
  const t = await getTranslations("reportsCalendar");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={view === "month" ? t("monthly.subtitle") : t("subtitle")}
      />
      <div className="space-y-4">
        {view === "month" ? (
          <MonthView params={params} planning={planning} />
        ) : (
          <WeekView params={params} planning={planning} />
        )}
      </div>
    </div>
  );
}
