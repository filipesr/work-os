import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { getMonthlyCalendarDemands } from "@/lib/actions/reporting";
import { getProjectsForSelect, getTemplatesForSelect } from "@/lib/actions/task";
import { getEventsInRange } from "@/lib/calendar/events";
import {
  parseMonthParam,
  monthRangeFromFirst,
  shiftMonth,
  formatISODate,
  todayInSaoPaulo,
} from "@/lib/dates";
import { MonthlyCalendar } from "@/components/reports/calendar/MonthlyCalendar";
import type { MonthDay, MonthEvent } from "@/components/reports/calendar/monthly-types";

export async function generateMetadata() {
  const t = await getTranslations("reportsCalendar.monthly");
  return { title: t("title") };
}

function formatYearMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function MonthlyCalendarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const t = await getTranslations("reportsCalendar.monthly");
  const locale = await getLocale();
  const isEs = locale.startsWith("es");

  const first = parseMonthParam(params.month);
  const range = monthRangeFromFirst(first);
  const todayIso = formatISODate(todayInSaoPaulo());

  const [demandsByDay, rawProjects, rawTemplates] = await Promise.all([
    getMonthlyCalendarDemands({ start: range.gridStart, end: range.gridEnd }),
    getProjectsForSelect(),
    getTemplatesForSelect(),
  ]);

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
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-border bg-card text-foreground hover:bg-accent transition-colors";

  return (
    <div className="container mx-auto p-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/reports/calendar/monthly?month=${prevMonth}`}
            aria-label={t("nav.prev")}
            className={navBtn}
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <span className="min-w-[10rem] text-center text-lg font-semibold capitalize text-foreground">
            {monthLabel}
          </span>
          <Link
            href={`/reports/calendar/monthly?month=${nextMonth}`}
            aria-label={t("nav.next")}
            className={navBtn}
          >
            <ChevronRight className="h-5 w-5" />
          </Link>
          <Link
            href="/reports/calendar/monthly"
            className="ml-1 inline-flex h-9 items-center rounded-lg border-2 border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            {t("nav.today")}
          </Link>
        </div>
      </div>

      <MonthlyCalendar
        days={days}
        eventsByDay={eventsByDay}
        demandsByDay={demandsByDay}
        projects={projects}
        templates={templates}
      />
    </div>
  );
}
