import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";

type StatsCardsProps = {
  userId: string;
};

export async function StatsCards({ userId }: StatsCardsProps) {
  const t = await getTranslations("dashboard.stats");

  // Fetch user statistics
  const stats = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const [activeTasks, completedThisWeek, hoursResult, upcomingDeadlines] =
      await Promise.all([
        // Count my active stages
        tx.taskActiveStage.count({
          where: {
            assigneeId: userId,
            status: "ACTIVE",
          },
        }),
        // Count stages I completed this week
        tx.taskActiveStage.count({
          where: {
            assigneeId: userId,
            status: "COMPLETED",
            completedAt: { gte: weekAgo },
          },
        }),
        // Hours logged today
        tx.timeLog.aggregate({
          where: {
            userId,
            logDate: { gte: startOfToday },
          },
          _sum: { hoursSpent: true },
        }),
        // Upcoming deadlines
        tx.taskActiveStage.count({
          where: {
            assigneeId: userId,
            status: "ACTIVE",
            task: {
              dueDate: {
                lte: threeDaysFromNow,
                gte: now,
              },
            },
          },
        }),
      ]);

    return {
      activeTasks,
      completedThisWeek,
      hoursLoggedToday: hoursResult._sum.hoursSpent || 0,
      upcomingDeadlines,
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Active Tasks Card */}
      <div className="bg-card p-4 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
        <p className="text-sm text-muted-foreground mb-1">
          {t("activeTasks")}
        </p>
        <p className="text-3xl font-bold text-foreground">{stats.activeTasks}</p>
      </div>

      {/* Completed This Week Card */}
      <div className="bg-card p-4 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
        <p className="text-sm text-muted-foreground mb-1">
          {t("completedWeek")}
        </p>
        <p className="text-3xl font-bold text-green-600">
          {stats.completedThisWeek}
        </p>
      </div>

      {/* Hours Today Card */}
      <div className="bg-card p-4 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
        <p className="text-sm text-muted-foreground mb-1">{t("hoursToday")}</p>
        <p className="text-3xl font-bold text-blue-600">
          {stats.hoursLoggedToday.toFixed(1)}h
        </p>
      </div>

      {/* Upcoming Deadlines Card */}
      <div className="bg-card p-4 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
        <p className="text-sm text-muted-foreground mb-1">
          {t("upcomingDeadlines")}
        </p>
        <p className="text-3xl font-bold text-orange-600">
          {stats.upcomingDeadlines}
        </p>
      </div>
    </div>
  );
}
