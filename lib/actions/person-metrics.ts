// Métricas de carga/entrega por pessoa, auto-referenciadas (nunca comparativas).
// NÃO "use server": consumidas por Server Components (perfil admin + dashboard).
// Fail-closed via requireSelfOrManager. Inclui qualidade (defeito-only, 3b.T3).
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

// Predicado defeito-only reutilizado (null + DEFECT contam; LEGITIMATE não).
const DEFECT_ONLY = [{ reworkClass: null }, { reworkClass: "DEFECT" as const }];

export interface PersonQuality {
  completed: number;
  defectReturns: number;
  firstTimeRight: number | null;
  internal: number;
  client: number;
}

/** Qualidade da pessoa na janela: FTR defeito-only + split interno/cliente.
 * Auto-referenciado (nunca comparativo). Atribuição confundida → tendência+contexto. */
export async function getPersonQuality(
  userId: string,
  range: { from: Date; to: Date }
): Promise<PersonQuality> {
  await requireSelfOrManager(userId);
  const [completed, defects] = await Promise.all([
    prisma.taskActiveStage.count({
      where: {
        assigneeId: userId,
        status: "COMPLETED",
        completedAt: { gte: range.from, lte: range.to },
      },
    }),
    prisma.reworkEvent.findMany({
      where: { sourceAssigneeId: userId, at: { gte: range.from, lte: range.to }, OR: DEFECT_ONLY },
      select: { kind: true },
    }),
  ]);
  const internal = defects.filter((d) => d.kind === "INTERNAL").length;
  const client = defects.length - internal;
  const firstTimeRight =
    completed === 0 ? null : Math.max(0, Math.min(1, 1 - defects.length / completed));
  return { completed, defectReturns: defects.length, firstTimeRight, internal, client };
}

export interface PersonReworkItem {
  id: string;
  at: string;
  taskTitle: string;
  sourceStageName: string;
  kind: "INTERNAL" | "CLIENT";
  reason: string;
  reworkClass: "DEFECT" | "LEGITIMATE" | null;
}

/** Retornos atribuídos à pessoa (todas as classes, p/ o gestor reclassificar). */
export async function getPersonReworkEvents(
  userId: string,
  limit = 20
): Promise<PersonReworkItem[]> {
  await requireSelfOrManager(userId);
  const rows = await prisma.reworkEvent.findMany({
    where: { sourceAssigneeId: userId },
    orderBy: { at: "desc" },
    take: limit,
    select: {
      id: true,
      at: true,
      kind: true,
      reason: true,
      reworkClass: true,
      sourceStage: { select: { name: true } },
      task: { select: { title: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    taskTitle: r.task.title,
    sourceStageName: r.sourceStage.name,
    kind: r.kind,
    reason: r.reason,
    reworkClass: r.reworkClass,
  }));
}

export interface PersonActiveStage {
  id: string;
  taskId: string;
  taskTitle: string;
  stageName: string;
  templateName: string;
  activatedAt: string; // ISO
  /** idade ÷ SLA da etapa; `>= AGING_ALERT_RATIO` = envelhecendo. */
  agingRatio: number;
}

/** Etapas ativas da pessoa agora, com o envelhecimento já resolvido. Antes
 * vivia inline no CRUD `/admin/users/[userId]`, sem o aging e sem fail-closed. */
export async function getPersonActiveStages(userId: string): Promise<PersonActiveStage[]> {
  await requireSelfOrManager(userId);
  const now = Date.now();
  const rows = await prisma.taskActiveStage.findMany({
    where: { assigneeId: userId, status: "ACTIVE" },
    orderBy: { activatedAt: "asc" }, // mais antigas primeiro: a fila de atenção
    select: {
      id: true,
      activatedAt: true,
      task: { select: { id: true, title: true } },
      stage: {
        select: {
          name: true,
          expectedDurationHours: true,
          template: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    taskId: r.task.id,
    taskTitle: r.task.title,
    stageName: r.stage.name,
    templateName: r.stage.template.name,
    activatedAt: r.activatedAt.toISOString(),
    agingRatio: stageAgingRatio(
      r.activatedAt,
      r.stage.expectedDurationHours ?? DEFAULT_SLA_HOURS,
      now
    ),
  }));
}

export interface PersonTimeLogItem {
  id: string;
  logDate: string; // ISO
  hoursSpent: number;
  description: string | null;
  taskTitle: string;
  /** Null quando o registro não foi amarrado a uma etapa (stageId é opcional). */
  stageName: string | null;
}

/** Registros de tempo recentes da pessoa (mais novos primeiro). O contexto por
 * trás do número de utilização — sem ele, "112%" é uma acusação sem prova. */
export async function getPersonTimeLogs(userId: string, limit = 10): Promise<PersonTimeLogItem[]> {
  await requireSelfOrManager(userId);
  const rows = await prisma.timeLog.findMany({
    where: { userId },
    orderBy: { logDate: "desc" },
    take: limit,
    select: {
      id: true,
      logDate: true,
      hoursSpent: true,
      description: true,
      task: { select: { title: true } },
      stage: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    logDate: r.logDate.toISOString(),
    hoursSpent: Number(r.hoursSpent),
    description: r.description,
    taskTitle: r.task.title,
    stageName: r.stage?.name ?? null,
  }));
}
