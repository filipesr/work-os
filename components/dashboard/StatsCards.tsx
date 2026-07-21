import { prisma } from "@/lib/prisma";
import { getTranslations } from "next-intl/server";
import { getDueState } from "@/lib/dates";
import { stageAgingRatio } from "@/lib/team-health-format";
import { DEFAULT_SLA_HOURS, AGING_ALERT_RATIO } from "@/lib/actions/team-health";

type StatsCardsProps = {
  userId: string;
};

function Card({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="bg-card p-4 rounded-lg border shadow-sm hover:shadow-md transition-shadow">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

export async function StatsCards({ userId }: StatsCardsProps) {
  const t = await getTranslations("dashboard.stats");

  const stats = await prisma.$transaction(async (tx) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [myActive, completedThisWeek, hoursResult] = await Promise.all([
      // My active stages (drives WIP / aging / at-risk)
      tx.taskActiveStage.findMany({
        where: { assigneeId: userId, status: "ACTIVE" },
        select: {
          activatedAt: true,
          task: { select: { dueDate: true } },
          stage: { select: { expectedDurationHours: true } },
        },
      }),
      // Stages I completed this week
      tx.taskActiveStage.count({
        where: { assigneeId: userId, status: "COMPLETED", completedAt: { gte: weekAgo } },
      }),
      // Hours logged today
      tx.timeLog.aggregate({
        where: { userId, logDate: { gte: startOfToday } },
        _sum: { hoursSpent: true },
      }),
    ]);

    const now = Date.now();
    let aging = 0;
    let overdue = 0;
    let dueSoon = 0;
    for (const s of myActive) {
      if (
        stageAgingRatio(s.activatedAt, s.stage.expectedDurationHours ?? DEFAULT_SLA_HOURS, now) >=
        AGING_ALERT_RATIO
      ) {
        aging++;
      }
      const ds = getDueState(s.task.dueDate);
      if (ds === "overdue") overdue++;
      else if (ds === "dueSoon") dueSoon++;
    }

    return {
      activeTasks: myActive.length,
      aging,
      atRisk: overdue + dueSoon,
      completedThisWeek,
      hoursLoggedToday: hoursResult._sum.hoursSpent || 0,
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
      <Card
        label={t("activeTasks")}
        value={String(stats.activeTasks)}
        valueClass="text-foreground"
      />
      <Card label={t("aging")} value={String(stats.aging)} valueClass="text-red-600" />
      <Card label={t("atRisk")} value={String(stats.atRisk)} valueClass="text-amber-600" />
      <Card
        label={t("completedWeek")}
        value={String(stats.completedThisWeek)}
        valueClass="text-green-600"
      />
      <Card
        label={t("hoursToday")}
        value={`${stats.hoursLoggedToday.toFixed(1)}h`}
        valueClass="text-blue-600"
      />
    </div>
  );
}
