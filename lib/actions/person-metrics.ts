// Métricas de carga/entrega por pessoa, auto-referenciadas (nunca comparativas).
// NÃO "use server": consumidas por Server Components (perfil admin + dashboard).
// Fail-closed via requireSelfOrManager. SEM qualidade (é 3b).
import prisma from "@/lib/prisma";
import { requireSelfOrManager } from "@/lib/permissions";
import { stageAgingRatio, utilizationRatio } from "@/lib/team-health-format";
import { DEFAULT_SLA_HOURS, AGING_ALERT_RATIO } from "@/lib/actions/team-health";

const DAY_MS = 8.64e7;

export interface ThroughputPoint {
  weekStart: string; // ISO
  count: number;
}

/** Conclusões da pessoa por semana (últimas `weeks`), bucketizadas por completedAt. */
export async function getPersonThroughputSeries(
  userId: string,
  weeks = 8
): Promise<ThroughputPoint[]> {
  await requireSelfOrManager(userId);
  const now = Date.now();
  const from = new Date(now - weeks * 7 * DAY_MS);
  const rows = await prisma.taskActiveStage.findMany({
    where: { assigneeId: userId, status: "COMPLETED", completedAt: { gte: from } },
    select: { completedAt: true },
  });
  const startDay = Math.floor(from.getTime() / DAY_MS);
  const buckets = new Array(weeks).fill(0);
  for (const r of rows) {
    if (!r.completedAt) continue;
    const idx = Math.floor((Math.floor(r.completedAt.getTime() / DAY_MS) - startDay) / 7);
    if (idx >= 0 && idx < weeks) buckets[idx] += 1;
  }
  return buckets.map((count, w) => ({
    weekStart: new Date((startDay + w * 7) * DAY_MS).toISOString(),
    count,
  }));
}

export interface PersonWorkload {
  wip: number;
  aging: number;
}

/** Carga atual: WIP (etapas ACTIVE atribuídas) + quantas passaram do SLA. */
export async function getPersonWorkload(userId: string): Promise<PersonWorkload> {
  await requireSelfOrManager(userId);
  const now = Date.now();
  const stages = await prisma.taskActiveStage.findMany({
    where: { assigneeId: userId, status: "ACTIVE" },
    select: { activatedAt: true, stage: { select: { expectedDurationHours: true } } },
  });
  let aging = 0;
  for (const s of stages) {
    const ratio = stageAgingRatio(
      s.activatedAt,
      s.stage.expectedDurationHours ?? DEFAULT_SLA_HOURS,
      now
    );
    if (ratio >= AGING_ALERT_RATIO) aging++;
  }
  return { wip: stages.length, aging };
}

export interface PersonUtilization {
  hours: number;
  weeklyCapacityHours: number | null;
  utilization: number | null;
}

/** Utilização da pessoa no período (reusa utilizationRatio). Fail-closed. */
export async function getPersonUtilization(
  userId: string,
  range: { from: Date; to: Date }
): Promise<PersonUtilization> {
  await requireSelfOrManager(userId);
  const [agg, user] = await Promise.all([
    prisma.timeLog.aggregate({
      where: { userId, logDate: { gte: range.from, lte: range.to } },
      _sum: { hoursSpent: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { weeklyCapacityHours: true } }),
  ]);
  const hours = agg._sum.hoursSpent ?? 0;
  const periodWeeks = Math.max((range.to.getTime() - range.from.getTime()) / (7 * DAY_MS), 1 / 7);
  const weeklyCapacityHours = user?.weeklyCapacityHours ?? null;
  return {
    hours,
    weeklyCapacityHours,
    utilization: utilizationRatio(hours, weeklyCapacityHours, periodWeeks),
  };
}
