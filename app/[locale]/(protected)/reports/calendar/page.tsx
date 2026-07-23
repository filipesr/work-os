import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { getEventsInRange } from "@/lib/calendar/events";
import {
  parseWeekParam,
  weekRangeFromMonday,
  parseMonthParam,
  monthRangeFromFirst,
  shiftMonth,
  formatISODate,
  todayInSaoPaulo,
} from "@/lib/dates";
import { PageHeader } from "@/components/ui/PageHeader";
import { WeekNavigator } from "./WeekNavigator";
import { CalendarFiltersBar } from "./CalendarFiltersBar";
import { CalendarViewToggle } from "./CalendarViewToggle";
import { CalendarGrid } from "@/components/reports/calendar/CalendarGrid";
import { CalendarDndContext } from "@/components/reports/calendar/CalendarDndContext";
import { MonthlyCalendar } from "@/components/reports/calendar/MonthlyCalendar";
import type {
  DayAnniversaries,
  MonthDay,
  MonthEvent,
} from "@/components/reports/calendar/monthly-types";

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
  }>;
}

function formatYearMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─── Week mode ────────────────────────────────────────────────────────────────

async function WeekView({ params }: { params: Awaited<PageProps["searchParams"]> }) {
  const weekStart = parseWeekParam(params.week);
  const { end: weekEnd, days } = weekRangeFromMonday(weekStart);
  const dayDates = days.map((d) => d.toISOString());
  const showCompleted = params.showCompleted === "1";

  const [buckets, teams, projects, users] = await Promise.all([
    getCalendarTasks({
      weekStart,
      weekEnd,
      teamId: params.team || undefined,
      projectId: params.project || undefined,
      userId: params.user || undefined,
      showCompleted,
    }),
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: params.team ? { teams: { some: { id: params.team } } } : undefined,
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
  ]);

  const userOptions = users.map((u) => ({ id: u.id, name: u.name ?? u.email ?? u.id }));
  const validUserId =
    params.user && userOptions.some((u) => u.id === params.user) ? params.user : undefined;

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 overflow-x-auto rounded-xl border border-border bg-card p-3 shadow-sm">
        <CalendarViewToggle view="week" />
        <WeekNavigator weekStart={weekStart} weekEnd={weekEnd} />
        <div className="ml-auto">
          <CalendarFiltersBar
            teams={teams}
            projects={projects}
            users={userOptions}
            selected={{
              teamId: params.team,
              projectId: params.project,
              userId: validUserId,
              showCompleted,
            }}
          />
        </div>
      </div>

      <CalendarDndContext dayDates={dayDates}>
        <CalendarGrid buckets={buckets} weekStart={weekStart} />
      </CalendarDndContext>
    </>
  );
}

// ─── Month mode (folded in from the former /reports/calendar/monthly) ─────────

async function MonthView({
  params,
  t,
}: {
  params: Awaited<PageProps["searchParams"]>;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const locale = await getLocale();
  const isEs = locale.startsWith("es");

  const first = parseMonthParam(params.month);
  const range = monthRangeFromFirst(first);
  const todayIso = formatISODate(todayInSaoPaulo());

  const [demandsByDay, rawProjects, rawTemplates, clients, people] = await Promise.all([
    getMonthlyCalendarDemands({ start: range.gridStart, end: range.gridEnd }),
    getProjectsForSelect(),
    getTemplatesForSelect(),
    getClients(),
    getTeamAnniversaries(),
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

  const rawEvents = getEventsInRange(formatISODate(range.gridStart), formatISODate(range.gridEnd));
  const eventsByDay: Record<string, MonthEvent[]> = {};
  for (const e of rawEvents) {
    (eventsByDay[e.iso] ??= []).push({
      id: e.id,
      iso: e.iso,
      title: isEs ? e.titleEs : e.titlePt,
      countries: e.countries,
      type: e.type,
    });
  }

  const days: MonthDay[] = range.gridDays.map((d) => ({
    iso: formatISODate(d),
    day: d.getUTCDate(),
    inMonth: d.getUTCMonth() === first.getUTCMonth(),
    isToday: formatISODate(d) === todayIso,
  }));

  const projects = rawProjects.map((p) => ({
    id: p.id,
    name: p.name,
    clientId: p.clientId,
    clientName: p.client.name,
  }));
  const templates = rawTemplates.map((tpl) => ({ id: tpl.id, name: tpl.name }));

  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(first);

  const prevMonth = formatYearMonth(shiftMonth(first, -1));
  const nextMonth = formatYearMonth(shiftMonth(first, 1));

  const navBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-accent transition-colors";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <CalendarViewToggle view="month" />
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/reports/calendar?view=month&month=${prevMonth}`}
            aria-label={t("monthly.nav.prev")}
            className={navBtn}
            rel="prev"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <span className="min-w-[10rem] text-center text-lg font-semibold capitalize text-foreground">
            {monthLabel}
          </span>
          <Link
            href={`/reports/calendar?view=month&month=${nextMonth}`}
            aria-label={t("monthly.nav.next")}
            className={navBtn}
            rel="next"
          >
            <ChevronRight className="h-5 w-5" />
          </Link>
          <Link
            href="/reports/calendar?view=month"
            className="ml-1 inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            {t("monthly.nav.today")}
          </Link>
        </div>
      </div>

      <MonthlyCalendar
        days={days}
        eventsByDay={eventsByDay}
        demandsByDay={demandsByDay}
        anniversariesByDay={anniversariesByDay}
        clients={clients}
        projects={projects}
        templates={templates}
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
  const t = await getTranslations("reportsCalendar");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={t("title")}
        subtitle={view === "month" ? t("monthly.subtitle") : t("subtitle")}
      />
      <div className="space-y-4">
        {view === "month" ? <MonthView params={params} t={t} /> : <WeekView params={params} />}
      </div>
    </div>
  );
}
