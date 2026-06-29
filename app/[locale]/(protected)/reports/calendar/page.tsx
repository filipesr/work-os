import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getCalendarTasks } from "@/lib/actions/reporting";
import { parseWeekParam, weekRangeFromMonday } from "@/lib/dates";
import { WeekNavigator } from "./WeekNavigator";
import { CalendarFiltersBar } from "./CalendarFiltersBar";
import { CalendarGrid } from "@/components/reports/calendar/CalendarGrid";
import { CalendarDndContext } from "@/components/reports/calendar/CalendarDndContext";

export const metadata: Metadata = {
  title: "Calendário de Tarefas",
};

interface PageProps {
  searchParams: Promise<{
    week?: string;
    team?: string;
    project?: string;
    user?: string;
    showCompleted?: string;
  }>;
}

export default async function CalendarPage({ searchParams }: PageProps) {
  try {
    await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);
  } catch {
    redirect("/auth/signin");
  }

  const params = await searchParams;
  const weekStart = parseWeekParam(params.week);
  const { end: weekEnd, days } = weekRangeFromMonday(weekStart);
  // ISO date per day column, consumed by the drag-and-drop reschedule handler.
  const dayDates = days.map((d) => d.toISOString());

  const showCompleted = params.showCompleted === "1";

  const t = await getTranslations("reportsCalendar");

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
    <div className="container mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-1">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex items-center gap-4 bg-card border-2 border-border rounded-xl p-3 overflow-x-auto">
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
    </div>
  );
}
