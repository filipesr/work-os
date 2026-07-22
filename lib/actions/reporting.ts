"use server";

import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { Prisma } from "@prisma/client";
import { formatISODate, currentMonthSaoPaulo, monthKeySaoPaulo } from "@/lib/dates";
import { utilizationRatio } from "@/lib/team-health-format";
import { statusDurations, statusAt, type TransitionRow } from "@/lib/stage-transitions";
import { percentile } from "@/lib/stats";
import { forecastWhen, forecastHowMany, type ForecastResult } from "@/lib/monte-carlo";
import { MIN_CLASS_SAMPLES } from "@/lib/reporting-constants";
import {
  productivityFiltersSchema,
  performanceFiltersSchema,
  calendarFiltersSchema,
  startEndRangeSchema,
  periodRangeSchema,
} from "@/lib/validations";

// ========== Productivity Report (TimeLog Aggregations) ==========

export interface ProductivityFilters {
  startDate?: Date;
  endDate?: Date;
  projectId?: string;
  userId?: string;
  clientId?: string;
  teamId?: string;
}

/**
 * Shared TimeLog where-clause builder for the productivity report. Combines the
 * date range with user / team (the stage's defaultTeam) / project / client
 * filters so every breakdown applies the same criteria.
 */
function buildTimeLogWhere(filters: ProductivityFilters): Prisma.TimeLogWhereInput {
  const where: Prisma.TimeLogWhereInput = {};

  if (filters.startDate || filters.endDate) {
    const logDate: Prisma.DateTimeFilter = {};
    if (filters.startDate) logDate.gte = filters.startDate;
    if (filters.endDate) logDate.lte = filters.endDate;
    where.logDate = logDate;
  }

  if (filters.userId) where.userId = filters.userId;

  // Team filter targets the stage the time was logged against.
  if (filters.teamId) where.stage = { defaultTeamId: filters.teamId };

  // Project / client both constrain the parent task.
  const taskFilter: Prisma.TaskWhereInput = {};
  if (filters.projectId) taskFilter.projectId = filters.projectId;
  if (filters.clientId) taskFilter.project = { clientId: filters.clientId };
  if (Object.keys(taskFilter).length > 0) where.task = taskFilter;

  return where;
}

export interface HoursByUser {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  totalHours: number;
  weeklyCapacityHours: number | null;
  // Logged hours ÷ capacity prorated to the selected period. Null when no
  // capacity target is set or no date range is selected (no denominator).
  utilization: number | null;
}

export interface HoursByProject {
  projectId: string;
  projectName: string;
  clientName: string;
  totalHours: number;
}

export interface HoursByClient {
  clientId: string;
  clientName: string;
  totalHours: number;
}

export interface HoursByStage {
  stageId: string;
  stageName: string;
  templateName: string;
  totalHours: number;
}

/**
 * Months (SP-local "YYYY-MM", newest first) that have time logs, always
 * including the current month so it can be the default selection even with no
 * records yet. Powers the month dropdown on the productivity report.
 */
export async function getAvailableTimeLogMonths(): Promise<string[]> {
  await requireManagerOrAdmin();

  const logs = await prisma.timeLog.findMany({ select: { logDate: true } });
  const months = new Set<string>(logs.map((l) => monthKeySaoPaulo(l.logDate)));
  months.add(currentMonthSaoPaulo());

  return Array.from(months).sort((a, b) => (a < b ? 1 : -1)); // desc (newest first)
}

/**
 * Get total hours logged grouped by user
 */
export async function getHoursByUser(filters: ProductivityFilters = {}) {
  // Require MANAGER or ADMIN role
  await requireManagerOrAdmin();
  filters = productivityFiltersSchema.parse(filters);

  const where = buildTimeLogWhere(filters);

  const timeLogs = await prisma.timeLog.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          weeklyCapacityHours: true,
        },
      },
    },
  });

  // Prorate the weekly capacity to the selected period. Utilization needs a date
  // range; without one there is no denominator.
  const periodWeeks =
    filters.startDate && filters.endDate
      ? Math.max((filters.endDate.getTime() - filters.startDate.getTime()) / (7 * DAY_MS), 1 / 7)
      : null;

  // Group by user
  const grouped = timeLogs.reduce((acc: Record<string, HoursByUser>, log) => {
    const userId = log.userId;
    if (!acc[userId]) {
      acc[userId] = {
        userId,
        userName: log.user.name,
        userEmail: log.user.email,
        totalHours: 0,
        weeklyCapacityHours: log.user.weeklyCapacityHours,
        utilization: null,
      };
    }
    acc[userId].totalHours += log.hoursSpent;
    return acc;
  }, {});

  for (const row of Object.values(grouped)) {
    row.utilization = utilizationRatio(row.totalHours, row.weeklyCapacityHours, periodWeeks);
  }

  return Object.values(grouped) as HoursByUser[];
}

/**
 * Get total hours logged grouped by project
 */
export async function getHoursByProject(filters: ProductivityFilters = {}) {
  await requireManagerOrAdmin();
  filters = productivityFiltersSchema.parse(filters);

  const where = buildTimeLogWhere(filters);

  const timeLogs = await prisma.timeLog.findMany({
    where,
    include: {
      task: {
        include: {
          project: {
            include: {
              client: true,
            },
          },
        },
      },
    },
  });

  // Group by project
  const grouped = timeLogs.reduce((acc: Record<string, HoursByProject>, log) => {
    const projectId = log.task.projectId;
    if (!acc[projectId]) {
      acc[projectId] = {
        projectId,
        projectName: log.task.project.name,
        clientName: log.task.project.client.name,
        totalHours: 0,
      };
    }
    acc[projectId].totalHours += log.hoursSpent;
    return acc;
  }, {});

  return Object.values(grouped) as HoursByProject[];
}

/**
 * Get total hours logged grouped by client
 */
export async function getHoursByClient(filters: ProductivityFilters = {}) {
  await requireManagerOrAdmin();
  filters = productivityFiltersSchema.parse(filters);

  const where = buildTimeLogWhere(filters);

  const timeLogs = await prisma.timeLog.findMany({
    where,
    include: {
      task: {
        include: {
          project: {
            include: {
              client: true,
            },
          },
        },
      },
    },
  });

  // Group by client
  const grouped = timeLogs.reduce((acc: Record<string, HoursByClient>, log) => {
    const clientId = log.task.project.clientId;
    if (!acc[clientId]) {
      acc[clientId] = {
        clientId,
        clientName: log.task.project.client.name,
        totalHours: 0,
      };
    }
    acc[clientId].totalHours += log.hoursSpent;
    return acc;
  }, {});

  return Object.values(grouped) as HoursByClient[];
}

/**
 * Get total hours logged grouped by workflow stage
 */
export async function getHoursByStage(filters: ProductivityFilters = {}) {
  await requireManagerOrAdmin();
  filters = productivityFiltersSchema.parse(filters);

  const where = buildTimeLogWhere(filters);

  const timeLogs = await prisma.timeLog.findMany({
    where: {
      ...where,
      stageId: { not: null }, // Only logs with stage association
    },
    include: {
      stage: {
        include: {
          template: true,
        },
      },
    },
  });

  // Group by stage
  const grouped = timeLogs.reduce((acc: Record<string, HoursByStage>, log) => {
    if (!log.stage) return acc;

    const stageId = log.stage.id;
    if (!acc[stageId]) {
      acc[stageId] = {
        stageId,
        stageName: log.stage.name,
        templateName: log.stage.template.name,
        totalHours: 0,
      };
    }
    acc[stageId].totalHours += log.hoursSpent;
    return acc;
  }, {});

  return Object.values(grouped) as HoursByStage[];
}

// ========== Performance Report (TaskStageLog Analysis) ==========

export interface PerformanceFilters {
  startDate?: Date;
  endDate?: Date;
  templateId?: string;
  projectId?: string;
  clientId?: string;
  teamId?: string;
}

/** Shared where for stage-log-based performance metrics (avg time, rework):
 * date range + team (stage.defaultTeam) + project/client (parent task). */
function buildStageLogWhere(filters: PerformanceFilters): Prisma.TaskStageLogWhereInput {
  const where: Prisma.TaskStageLogWhereInput = { exitedAt: { not: null } };

  if (filters.startDate || filters.endDate) {
    const enteredAt: Prisma.DateTimeFilter = {};
    if (filters.startDate) enteredAt.gte = filters.startDate;
    if (filters.endDate) enteredAt.lte = filters.endDate;
    where.enteredAt = enteredAt;
  }

  const stageFilter: Prisma.TemplateStageWhereInput = {};
  if (filters.templateId) stageFilter.templateId = filters.templateId;
  if (filters.teamId) stageFilter.defaultTeamId = filters.teamId;
  if (Object.keys(stageFilter).length > 0) where.stage = stageFilter;

  const taskFilter: Prisma.TaskWhereInput = {};
  if (filters.projectId) taskFilter.projectId = filters.projectId;
  if (filters.clientId) taskFilter.project = { clientId: filters.clientId };
  if (Object.keys(taskFilter).length > 0) where.task = taskFilter;

  return where;
}

/** Task where for lead-time metrics (completed tasks), with the same filters.
 * Team applies to tasks that actually entered a stage owned by that team. */
function buildLeadTimeWhere(filters: PerformanceFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {};

  if (filters.startDate || filters.endDate) {
    const completedAt: Prisma.DateTimeFilter = {};
    if (filters.startDate) completedAt.gte = filters.startDate;
    if (filters.endDate) completedAt.lte = filters.endDate;
    where.completedAt = completedAt;
  } else {
    where.completedAt = { not: null };
  }

  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.clientId) where.project = { clientId: filters.clientId };
  if (filters.teamId) where.stageLogs = { some: { stage: { defaultTeamId: filters.teamId } } };
  if (filters.templateId) where.workflowTemplateId = filters.templateId;

  return where;
}

/**
 * Months (SP-local "YYYY-MM", newest first) with stage activity, always
 * including the current month. Powers the month dropdown on the performance
 * report (mirrors getAvailableTimeLogMonths for the productivity report).
 */
export async function getAvailablePerformanceMonths(): Promise<string[]> {
  await requireManagerOrAdmin();

  const logs = await prisma.taskStageLog.findMany({ select: { enteredAt: true } });
  const months = new Set<string>(logs.map((l) => monthKeySaoPaulo(l.enteredAt)));
  months.add(currentMonthSaoPaulo());

  return Array.from(months).sort((a, b) => (a < b ? 1 : -1));
}

export interface AverageTimePerStage {
  stageId: string;
  stageName: string;
  templateName: string;
  averageDurationHours: number;
  averageDurationDays: number;
  count: number;
}

export interface ReworkRateByStage {
  stageId: string;
  stageName: string;
  templateName: string;
  completed: number;
  reverted: number;
  reworkRate: number;
}

export interface LeadTimeMetrics {
  averageLeadTimeDays: number;
  medianLeadTimeDays: number;
  count: number;
}

export interface FlowEfficiencyByStage {
  stageId: string;
  stageName: string;
  templateName: string;
  flowEfficiency: number; // 0..1 — Σ ACTIVE ÷ Σ (ACTIVE + BLOCKED), throughput-weighted
  activeHours: number; // total "touched" time across instances
  blockedHours: number; // total "waiting on dependencies" time across instances
  count: number; // stage instances contributing (with reached time > 0)
}

/**
 * Calculate average time spent in each workflow stage
 * This identifies bottlenecks in the workflow
 */
export async function getAverageTimePerStage(filters: PerformanceFilters = {}) {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);

  const where = buildStageLogWhere(filters);

  const stageLogs = await prisma.taskStageLog.findMany({
    where,
    include: {
      stage: {
        include: {
          template: true,
        },
      },
    },
  });

  // Calculate duration for each log and group by stage
  const stageData: Record<
    string,
    {
      stageId: string;
      stageName: string;
      templateName: string;
      totalDurationHours: number;
      count: number;
    }
  > = {};

  stageLogs.forEach((log) => {
    if (!log.exitedAt) return;

    const durationMs = new Date(log.exitedAt).getTime() - new Date(log.enteredAt).getTime();
    const durationHours = durationMs / (1000 * 60 * 60);

    const stageId = log.stageId;
    if (!stageData[stageId]) {
      stageData[stageId] = {
        stageId,
        stageName: log.stage.name,
        templateName: log.stage.template.name,
        totalDurationHours: 0,
        count: 0,
      };
    }

    stageData[stageId].totalDurationHours += durationHours;
    stageData[stageId].count += 1;
  });

  // Calculate averages
  const results: AverageTimePerStage[] = Object.values(stageData).map((data) => ({
    stageId: data.stageId,
    stageName: data.stageName,
    templateName: data.templateName,
    averageDurationHours: data.totalDurationHours / data.count,
    averageDurationDays: data.totalDurationHours / data.count / 24,
    count: data.count,
  }));

  // Sort by average duration (descending) to show bottlenecks first
  return results.sort((a, b) => b.averageDurationHours - a.averageDurationHours);
}

/**
 * Flow efficiency per stage: of the time a stage was "reached", what fraction
 * was ACTIVE ("touched") vs BLOCKED ("waiting on dependencies"). Reconstructed
 * from the StageTransition log (statusDurations), aggregated throughput-weighted
 * per stage template. A LOW number means the stage spends most of its life
 * waiting, not being worked — the opposite fix from a stage that is simply slow.
 *
 * When a date window is set, only instances COMPLETED within it are counted
 * (mirrors lead-time-by-completion); without a window, every reached instance
 * counts (including still-open ones, which accrue up to now). Sorted worst
 * (lowest efficiency = most waiting) first.
 */
export async function getFlowEfficiencyByStage(filters: PerformanceFilters = {}) {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);

  const stageFilter: Prisma.TemplateStageWhereInput = {};
  if (filters.templateId) stageFilter.templateId = filters.templateId;
  if (filters.teamId) stageFilter.defaultTeamId = filters.teamId;

  const taskFilter: Prisma.TaskWhereInput = {};
  if (filters.projectId) taskFilter.projectId = filters.projectId;
  if (filters.clientId) taskFilter.project = { clientId: filters.clientId };

  const where: Prisma.StageTransitionWhereInput = {};
  if (Object.keys(stageFilter).length > 0) where.stage = stageFilter;
  if (Object.keys(taskFilter).length > 0) where.task = taskFilter;

  const rows = await prisma.stageTransition.findMany({
    where,
    select: {
      taskId: true,
      stageId: true,
      status: true,
      at: true,
      stage: { select: { name: true, template: { select: { name: true } } } },
    },
    orderBy: { at: "asc" },
  });

  // Group transitions by stage INSTANCE (task + stage).
  type Instance = {
    stageId: string;
    stageName: string;
    templateName: string;
    rows: TransitionRow[];
  };
  const byInstance = new Map<string, Instance>();
  for (const r of rows) {
    const key = `${r.taskId}::${r.stageId}`;
    let inst = byInstance.get(key);
    if (!inst) {
      inst = {
        stageId: r.stageId,
        stageName: r.stage.name,
        templateName: r.stage.template.name,
        rows: [],
      };
      byInstance.set(key, inst);
    }
    inst.rows.push({ status: r.status, at: r.at });
  }

  const now = Date.now();
  const hasWindow = Boolean(filters.startDate || filters.endDate);
  const perStage = new Map<
    string,
    {
      stageId: string;
      stageName: string;
      templateName: string;
      active: number;
      blocked: number;
      count: number;
    }
  >();

  for (const inst of byInstance.values()) {
    if (hasWindow) {
      // Only instances completed within the window count in a windowed report.
      const completed = [...inst.rows].reverse().find((r) => r.status === "COMPLETED");
      if (!completed) continue;
      const t = completed.at.getTime();
      if (filters.startDate && t < filters.startDate.getTime()) continue;
      if (filters.endDate && t > filters.endDate.getTime()) continue;
    }

    const d = statusDurations(inst.rows, now);
    if (d.ACTIVE + d.BLOCKED <= 0) continue;

    let agg = perStage.get(inst.stageId);
    if (!agg) {
      agg = {
        stageId: inst.stageId,
        stageName: inst.stageName,
        templateName: inst.templateName,
        active: 0,
        blocked: 0,
        count: 0,
      };
      perStage.set(inst.stageId, agg);
    }
    agg.active += d.ACTIVE;
    agg.blocked += d.BLOCKED;
    agg.count += 1;
  }

  const results: FlowEfficiencyByStage[] = Array.from(perStage.values()).map((a) => ({
    stageId: a.stageId,
    stageName: a.stageName,
    templateName: a.templateName,
    flowEfficiency: a.active / (a.active + a.blocked),
    activeHours: a.active / 3.6e6,
    blockedHours: a.blocked / 3.6e6,
    count: a.count,
  }));

  return results.sort((a, b) => a.flowEfficiency - b.flowEfficiency);
}

/**
 * Calculate rework rate (how often tasks are reverted) per stage
 * This measures quality and identifies problematic stages
 */
export async function getReworkRateByStage(filters: PerformanceFilters = {}) {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);

  const where: Prisma.TaskStageLogWhereInput = {
    ...buildStageLogWhere(filters),
    status: { not: null }, // Only logs with status set
  };

  const stageLogs = await prisma.taskStageLog.findMany({
    where,
    include: {
      stage: {
        include: {
          template: true,
        },
      },
    },
  });

  // Group by stage and count completed vs reverted
  const stageData: Record<
    string,
    {
      stageId: string;
      stageName: string;
      templateName: string;
      completed: number;
      reverted: number;
    }
  > = {};

  stageLogs.forEach((log) => {
    const stageId = log.stageId;
    if (!stageData[stageId]) {
      stageData[stageId] = {
        stageId,
        stageName: log.stage.name,
        templateName: log.stage.template.name,
        completed: 0,
        reverted: 0,
      };
    }

    if (log.status === "COMPLETED") {
      stageData[stageId].completed += 1;
    } else if (log.status === "REVERTED") {
      stageData[stageId].reverted += 1;
    }
  });

  // Calculate rework rate
  const results: ReworkRateByStage[] = Object.values(stageData).map((data) => {
    const total = data.completed + data.reverted;
    return {
      stageId: data.stageId,
      stageName: data.stageName,
      templateName: data.templateName,
      completed: data.completed,
      reverted: data.reverted,
      reworkRate: total > 0 ? data.reverted / total : 0,
    };
  });

  // Sort by rework rate (descending) to show problem areas first
  return results.sort((a, b) => b.reworkRate - a.reworkRate);
}

export interface ReworkBySourceStage {
  stageId: string;
  stageName: string;
  templateName: string;
  internal: number;
  client: number;
  total: number;
}

/** Where para ReworkEvent: janela (por `at`) + template/time via sourceStage
 * (sourceStage.templateId / sourceStage.defaultTeamId, coerente com
 * buildStageLogWhere) + project/client via task. */
function buildReworkWhere(filters: PerformanceFilters): Prisma.ReworkEventWhereInput {
  const where: Prisma.ReworkEventWhereInput = {};
  if (filters.startDate || filters.endDate) {
    const at: Prisma.DateTimeFilter = {};
    if (filters.startDate) at.gte = filters.startDate;
    if (filters.endDate) at.lte = filters.endDate;
    where.at = at;
  }
  const stageFilter: Prisma.TemplateStageWhereInput = {};
  if (filters.templateId) stageFilter.templateId = filters.templateId;
  if (filters.teamId) stageFilter.defaultTeamId = filters.teamId;
  if (Object.keys(stageFilter).length > 0) where.sourceStage = stageFilter;
  const taskFilter: Prisma.TaskWhereInput = {};
  if (filters.projectId) taskFilter.projectId = filters.projectId;
  if (filters.clientId) taskFilter.project = { clientId: filters.clientId };
  if (Object.keys(taskFilter).length > 0) where.task = taskFilter;
  return where;
}

/**
 * Retrabalho agrupado por etapa-ORIGEM, com split interno vs cliente. Responde
 * "qual etapa mais injeta defeito a jusante, e está sendo pego dentro (bom) ou
 * escapando pro cliente (custoso)". Sinal de PROCESSO — nunca por pessoa.
 */
export async function getReworkBySourceStage(
  filters: PerformanceFilters = {}
): Promise<ReworkBySourceStage[]> {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);

  const events = await prisma.reworkEvent.findMany({
    where: buildReworkWhere(filters),
    select: {
      kind: true,
      sourceStage: { select: { id: true, name: true, template: { select: { name: true } } } },
    },
  });

  const byStage = new Map<string, ReworkBySourceStage>();
  for (const e of events) {
    const s = e.sourceStage;
    let row = byStage.get(s.id);
    if (!row) {
      row = {
        stageId: s.id,
        stageName: s.name,
        templateName: s.template.name,
        internal: 0,
        client: 0,
        total: 0,
      };
      byStage.set(s.id, row);
    }
    if (e.kind === "INTERNAL") row.internal += 1;
    else row.client += 1;
    row.total += 1;
  }
  return Array.from(byStage.values()).sort((a, b) => b.total - a.total);
}

export interface FirstTimeRightByStage {
  stageId: string;
  stageName: string;
  templateName: string;
  completed: number;
  reworkedTo: number;
  firstTimeRight: number; // 0..1 = 1 − reworkedTo/completed (clamp)
}

/**
 * First-time-right por etapa: das etapas concluídas na janela, fração que NUNCA
 * virou alvo de retorno. Aproximação process-level (razão de janela, não
 * pareamento 1:1 completo↔retorno). Pior (menor FTR) primeiro.
 */
export async function getFirstTimeRightByStage(
  filters: PerformanceFilters = {}
): Promise<FirstTimeRightByStage[]> {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);

  const [completedLogs, reworkEvents] = await Promise.all([
    prisma.taskStageLog.findMany({
      where: { ...buildStageLogWhere(filters), status: "COMPLETED" },
      select: {
        stageId: true,
        stage: { select: { name: true, template: { select: { name: true } } } },
      },
    }),
    prisma.reworkEvent.findMany({
      where: buildReworkWhere(filters),
      select: { sourceStageId: true },
    }),
  ]);

  const reworkByStage = new Map<string, number>();
  for (const e of reworkEvents)
    reworkByStage.set(e.sourceStageId, (reworkByStage.get(e.sourceStageId) ?? 0) + 1);

  const agg = new Map<string, FirstTimeRightByStage>();
  for (const log of completedLogs) {
    let row = agg.get(log.stageId);
    if (!row) {
      row = {
        stageId: log.stageId,
        stageName: log.stage.name,
        templateName: log.stage.template.name,
        completed: 0,
        reworkedTo: 0,
        firstTimeRight: 1,
      };
      agg.set(log.stageId, row);
    }
    row.completed += 1;
  }
  for (const row of agg.values()) {
    row.reworkedTo = reworkByStage.get(row.stageId) ?? 0;
    row.firstTimeRight = Math.max(0, Math.min(1, 1 - row.reworkedTo / row.completed));
  }
  return Array.from(agg.values()).sort((a, b) => a.firstTimeRight - b.firstTimeRight);
}

/**
 * Calculate lead time metrics (time from task creation to completion)
 */
export async function getLeadTimeMetrics(filters: PerformanceFilters = {}) {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);

  const where = buildLeadTimeWhere(filters);

  const tasks = await prisma.task.findMany({
    where,
    select: {
      id: true,
      createdAt: true,
      completedAt: true,
    },
  });

  if (tasks.length === 0) {
    return {
      averageLeadTimeDays: 0,
      medianLeadTimeDays: 0,
      count: 0,
    };
  }

  // Calculate lead time for each task
  const leadTimes = tasks.map((task) => {
    const durationMs = new Date(task.completedAt!).getTime() - new Date(task.createdAt).getTime();
    return durationMs / (1000 * 60 * 60 * 24); // Convert to days
  });

  // Calculate average
  const averageLeadTimeDays = leadTimes.reduce((sum, time) => sum + time, 0) / leadTimes.length;

  // Calculate median
  const sorted = leadTimes.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianLeadTimeDays =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  return {
    averageLeadTimeDays,
    medianLeadTimeDays,
    count: tasks.length,
  };
}

export interface CycleTimePercentiles {
  count: number;
  p50: number; // days
  p85: number; // days — the "confident date" to commit to
  p95: number; // days
  points: { days: number; at: string }[]; // scatter (ISO completion date), newest-capped
  lowConfidence: boolean; // sample size below MIN_CLASS_SAMPLES — treat percentiles as indicative only
}

// Bound the scatter payload; percentiles still use the full population.
const CYCLE_SCATTER_CAP = 300;

/**
 * Cycle-time distribution for completed tasks (createdAt → completedAt), in
 * days, with p50/p85/p95. Probabilistic forecasting starts here: instead of an
 * average, commit to the 85th-percentile duration — the date you hit ~85% of
 * the time. `points` powers a scatterplot (capped to the most recent
 * CYCLE_SCATTER_CAP completions); percentiles use the full population.
 */
export async function getCycleTimePercentiles(
  filters: PerformanceFilters = {}
): Promise<CycleTimePercentiles> {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);

  const where = buildLeadTimeWhere(filters);
  const tasks = await prisma.task.findMany({
    where,
    select: { createdAt: true, completedAt: true },
    orderBy: { completedAt: "desc" },
  });

  if (tasks.length === 0) {
    return { count: 0, p50: 0, p85: 0, p95: 0, points: [], lowConfidence: true };
  }

  const days = tasks.map(
    (t) => (new Date(t.completedAt!).getTime() - new Date(t.createdAt).getTime()) / 8.64e7
  );

  const points = tasks.slice(0, CYCLE_SCATTER_CAP).map((t, i) => ({
    days: days[i],
    at: new Date(t.completedAt!).toISOString(),
  }));

  return {
    count: tasks.length,
    p50: percentile(days, 0.5),
    p85: percentile(days, 0.85),
    p95: percentile(days, 0.95),
    points,
    lowConfidence: tasks.length < MIN_CLASS_SAMPLES,
  };
}

/**
 * Lightweight reference-class forecast for ONE work type (template): cycle-time
 * percentiles (days) over that template's completed tasks. Powers the live
 * feasibility check on the task-creation form. Informational only.
 */
export async function getTypeForecast(templateId: string): Promise<{
  p50: number;
  p85: number;
  p95: number;
  count: number;
  lowConfidence: boolean;
}> {
  await requireManagerOrAdmin();
  if (!templateId) return { p50: 0, p85: 0, p95: 0, count: 0, lowConfidence: true };

  const tasks = await prisma.task.findMany({
    where: { workflowTemplateId: templateId, completedAt: { not: null } },
    select: { createdAt: true, completedAt: true },
  });
  if (tasks.length === 0) return { p50: 0, p85: 0, p95: 0, count: 0, lowConfidence: true };

  const days = tasks.map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / 8.64e7);
  return {
    p50: percentile(days, 0.5),
    p85: percentile(days, 0.85),
    p95: percentile(days, 0.95),
    count: tasks.length,
    lowConfidence: tasks.length < MIN_CLASS_SAMPLES,
  };
}

// ========== Time-series & Forecasting (P1) ==========

const DAY_MS = 8.64e7;
const THROUGHPUT_WINDOW_DAYS = 84; // ~12 weeks of history feeds the forecast
const CFD_WINDOW_DAYS = 56; // ~8 weeks of daily flow snapshots
const FORECAST_HORIZON_DAYS = 30; // "how many ship in the next 30 days"

/** Open (in-flight) tasks in scope — the forecast backlog. Team scope = a task
 * with an active/blocked stage owned by that team. */
function buildOpenTaskWhere(filters: PerformanceFilters): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = {
    status: { in: ["BACKLOG", "IN_PROGRESS", "PAUSED"] },
  };
  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.clientId) where.project = { clientId: filters.clientId };
  if (filters.teamId) {
    where.activeStages = {
      some: { status: { in: ["ACTIVE", "BLOCKED"] }, stage: { defaultTeamId: filters.teamId } },
    };
  }
  if (filters.templateId) where.workflowTemplateId = filters.templateId;
  return where;
}

/** Per-day completion counts (INCLUDING zero days) over the last N days — the
 * throughput distribution the Monte Carlo forecast samples from. */
async function dailyThroughputSamples(
  filters: PerformanceFilters,
  windowDays: number,
  now: number
): Promise<number[]> {
  const from = new Date(now - windowDays * DAY_MS);
  const where = buildLeadTimeWhere({ ...filters, startDate: from, endDate: new Date(now) });
  const tasks = await prisma.task.findMany({ where, select: { completedAt: true } });

  const buckets = new Array(windowDays).fill(0);
  const startDay = Math.floor(from.getTime() / DAY_MS);
  for (const t of tasks) {
    if (!t.completedAt) continue;
    const idx = Math.floor(t.completedAt.getTime() / DAY_MS) - startDay;
    if (idx >= 0 && idx < windowDays) buckets[idx] += 1;
  }
  return buckets;
}

export interface DeliveryForecast {
  backlog: number;
  sampleDays: number; // history depth used
  totalThroughput: number; // items completed in the window
  when: ForecastResult | null; // days to drain the backlog (null if no throughput)
  horizonDays: number;
  howMany: ForecastResult; // items shipped within horizonDays
}

/**
 * Monte Carlo delivery forecast: samples the last ~12 weeks of daily throughput
 * to answer, probabilistically, "when is the current backlog done?" (commit at
 * p85) and "how many items ship in the next 30 days?". Reuses only history that
 * already exists (task.completedAt). Runs the simulation server-side.
 */
export async function getDeliveryForecast(
  filters: PerformanceFilters = {}
): Promise<DeliveryForecast> {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);
  const now = Date.now();

  const [samples, backlog] = await Promise.all([
    dailyThroughputSamples(filters, THROUGHPUT_WINDOW_DAYS, now),
    prisma.task.count({ where: buildOpenTaskWhere(filters) }),
  ]);

  return {
    backlog,
    sampleDays: THROUGHPUT_WINDOW_DAYS,
    totalThroughput: samples.reduce((a, b) => a + b, 0),
    when: forecastWhen(samples, backlog),
    horizonDays: FORECAST_HORIZON_DAYS,
    howMany: forecastHowMany(samples, FORECAST_HORIZON_DAYS),
  };
}

export interface ThroughputPoint {
  weekStart: string; // ISO date of the week bucket start
  count: number;
}

/** Weekly completion counts over the last ~12 weeks — the throughput trend line. */
export async function getThroughputSeries(
  filters: PerformanceFilters = {}
): Promise<ThroughputPoint[]> {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);
  const now = Date.now();

  const weeks = Math.ceil(THROUGHPUT_WINDOW_DAYS / 7);
  const daily = await dailyThroughputSamples(filters, weeks * 7, now);
  const startDay = Math.floor((now - weeks * 7 * DAY_MS) / DAY_MS);

  const points: ThroughputPoint[] = [];
  for (let w = 0; w < weeks; w++) {
    let count = 0;
    for (let d = 0; d < 7; d++) count += daily[w * 7 + d] ?? 0;
    points.push({ weekStart: new Date((startDay + w * 7) * DAY_MS).toISOString(), count });
  }
  return points;
}

export interface CfdPoint {
  date: string; // ISO date (end of day)
  INACTIVE: number;
  BLOCKED: number;
  ACTIVE: number;
  COMPLETED: number;
}

/**
 * Status-band Cumulative Flow Diagram: for each of the last ~8 weeks of days,
 * how many stage instances were in each status at end of day — reconstructed by
 * replaying the StageTransition log (no snapshot table, no cron). Only reflects
 * data from the transition log's start (the P0.1 migration) onward. A BLOCKED
 * band widening over time = work piling up waiting; COMPLETED grows cumulatively.
 */
export async function getFlowCfdSeries(filters: PerformanceFilters = {}): Promise<CfdPoint[]> {
  await requireManagerOrAdmin();
  filters = performanceFiltersSchema.parse(filters);
  const now = Date.now();
  const windowStart = now - CFD_WINDOW_DAYS * DAY_MS;

  const stageFilter: Prisma.TemplateStageWhereInput = {};
  if (filters.templateId) stageFilter.templateId = filters.templateId;
  if (filters.teamId) stageFilter.defaultTeamId = filters.teamId;
  const taskFilter: Prisma.TaskWhereInput = {};
  if (filters.projectId) taskFilter.projectId = filters.projectId;
  if (filters.clientId) taskFilter.project = { clientId: filters.clientId };

  const where: Prisma.StageTransitionWhereInput = { at: { lte: new Date(now) } };
  if (Object.keys(stageFilter).length > 0) where.stage = stageFilter;
  if (Object.keys(taskFilter).length > 0) where.task = taskFilter;

  const rows = await prisma.stageTransition.findMany({
    where,
    select: { taskId: true, stageId: true, status: true, at: true },
    orderBy: { at: "asc" },
  });

  // Group transitions per (task, stage) instance.
  const byInstance = new Map<string, TransitionRow[]>();
  for (const r of rows) {
    const key = `${r.taskId}::${r.stageId}`;
    const arr = byInstance.get(key) ?? [];
    arr.push({ status: r.status, at: r.at });
    byInstance.set(key, arr);
  }
  const instances = Array.from(byInstance.values());

  const startDay = Math.floor(windowStart / DAY_MS);
  const points: CfdPoint[] = [];
  for (let d = 0; d < CFD_WINDOW_DAYS; d++) {
    const dayEnd = (startDay + d + 1) * DAY_MS - 1; // end-of-day ms
    const point: CfdPoint = {
      date: new Date(dayEnd).toISOString(),
      INACTIVE: 0,
      BLOCKED: 0,
      ACTIVE: 0,
      COMPLETED: 0,
    };
    for (const inst of instances) {
      const s = statusAt(inst, dayEnd);
      if (s) point[s] += 1;
    }
    points.push(point);
  }
  return points;
}

// ========== Calendar (Gantt) ==========

export interface CalendarFilters {
  weekStart: Date;
  weekEnd: Date;
  teamId?: string;
  projectId?: string;
  userId?: string;
  showCompleted?: boolean;
}

export interface CalendarTask {
  id: string;
  title: string;
  dueDate: Date | null;
  status: "BACKLOG" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED" | "OBSOLETE";
  projectId: string;
  projectName: string;
  clientName: string;
  primaryStageId: string | null;
  primaryStageName: string | null;
  extraStageCount: number;
  assigneeId: string | null;
  assigneeName: string | null;
  teamId: string | null;
  teamName: string | null;
}

export interface CalendarTeamBucket {
  teamId: string | null;
  teamName: string;
  tasks: CalendarTask[];
}

export interface CalendarBuckets {
  noDueDate: CalendarTask[];
  byTeam: CalendarTeamBucket[];
}

export async function getCalendarTasks(filters: CalendarFilters): Promise<CalendarBuckets> {
  await requireManagerOrAdmin();
  filters = calendarFiltersSchema.parse(filters);

  const { weekStart, weekEnd, teamId, projectId, userId, showCompleted } = filters;

  const statusFilter = showCompleted
    ? ["IN_PROGRESS", "BACKLOG", "PAUSED", "COMPLETED"]
    : ["IN_PROGRESS", "BACKLOG", "PAUSED"];

  const tasks = await prisma.task.findMany({
    where: {
      status: { in: statusFilter as ("IN_PROGRESS" | "BACKLOG" | "PAUSED" | "COMPLETED")[] },
      ...(projectId ? { projectId } : {}),
      ...(showCompleted
        ? {
            OR: [
              { dueDate: null },
              { dueDate: { gte: weekStart, lte: weekEnd } },
              { dueDate: { lt: weekStart } },
              { dueDate: { gt: weekEnd } },
              { completedAt: { gte: weekStart, lte: weekEnd } },
            ],
          }
        : {}),
      ...(teamId || userId
        ? {
            activeStages: {
              some: {
                status: { in: ["ACTIVE", "BLOCKED"] },
                ...(teamId ? { stage: { defaultTeamId: teamId } } : {}),
                ...(userId ? { assigneeId: userId } : {}),
              },
            },
          }
        : {}),
    },
    include: {
      project: { include: { client: true } },
      assignee: { select: { id: true, name: true } },
      activeStages: {
        include: {
          stage: { include: { defaultTeam: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { stage: { order: "asc" } },
      },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const calendarTasks: CalendarTask[] = tasks.map((task) => {
    const ongoingStages = task.activeStages.filter(
      (s) => s.status === "ACTIVE" || s.status === "BLOCKED"
    );
    const completedStages = task.activeStages.filter((s) => s.status === "COMPLETED");

    let primaryStage: (typeof task.activeStages)[number] | undefined =
      ongoingStages.find((s) => s.status === "ACTIVE") || ongoingStages[0];

    if (!primaryStage && task.status === "COMPLETED" && completedStages.length > 0) {
      primaryStage = completedStages.reduce((latest, current) =>
        current.stage.order > latest.stage.order ? current : latest
      );
    }

    const extraStageCount = Math.max(0, ongoingStages.length - 1);
    const stageAssignee = primaryStage?.assignee || null;

    return {
      id: task.id,
      title: task.title,
      dueDate: task.dueDate,
      status: task.status,
      projectId: task.project.id,
      projectName: task.project.name,
      clientName: task.project.client.name,
      primaryStageId: primaryStage?.stage.id ?? null,
      primaryStageName: primaryStage?.stage.name ?? null,
      extraStageCount,
      assigneeId: stageAssignee?.id ?? task.assignee?.id ?? null,
      assigneeName: stageAssignee?.name ?? task.assignee?.name ?? null,
      teamId: primaryStage?.stage.defaultTeam?.id ?? null,
      teamName: primaryStage?.stage.defaultTeam?.name ?? null,
    };
  });

  const noDueDate: CalendarTask[] = [];
  const teamMap = new Map<string, CalendarTeamBucket>();
  const NO_TEAM_KEY = "__no_team__";

  for (const task of calendarTasks) {
    if (!task.dueDate) {
      noDueDate.push(task);
      continue;
    }
    const key = task.teamId ?? NO_TEAM_KEY;
    if (!teamMap.has(key)) {
      teamMap.set(key, {
        teamId: task.teamId,
        teamName: task.teamName ?? "Sem equipe",
        tasks: [],
      });
    }
    teamMap.get(key)!.tasks.push(task);
  }

  const byTeam = Array.from(teamMap.values()).sort((a, b) => {
    if (a.teamId === null) return 1;
    if (b.teamId === null) return -1;
    return a.teamName.localeCompare(b.teamName);
  });

  return { noDueDate, byTeam };
}

// ========== Monthly Event Calendar ==========

export interface MonthlyDemandTask {
  id: string;
  title: string;
  status: "BACKLOG" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED" | "OBSOLETE";
  projectId: string;
  projectName: string;
  stageName: string | null;
  assigneeName: string | null;
}

export interface MonthlyClientDemands {
  clientId: string;
  clientName: string;
  tasks: MonthlyDemandTask[];
}

/**
 * Tasks with a dueDate inside [start, end], grouped by ISO day → client.
 * Used by the monthly event calendar to show which clients have demands per day.
 */
export async function getMonthlyCalendarDemands(range: {
  start: Date;
  end: Date;
}): Promise<Record<string, MonthlyClientDemands[]>> {
  await requireManagerOrAdmin();
  range = startEndRangeSchema.parse(range);

  const tasks = await prisma.task.findMany({
    where: {
      dueDate: { gte: range.start, lte: range.end },
      status: { not: "CANCELLED" },
    },
    include: {
      project: { include: { client: true } },
      activeStages: {
        where: { status: { in: ["ACTIVE", "BLOCKED"] } },
        include: {
          stage: { select: { name: true, order: true } },
          assignee: { select: { id: true, name: true } },
        },
        orderBy: { stage: { order: "asc" } },
      },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 1000,
  });

  const byDay = new Map<string, Map<string, MonthlyClientDemands>>();

  for (const task of tasks) {
    if (!task.dueDate) continue;
    const day = formatISODate(task.dueDate);
    const primary = task.activeStages.find((s) => s.status === "ACTIVE") || task.activeStages[0];
    const clientId = task.project.client.id;

    if (!byDay.has(day)) byDay.set(day, new Map());
    const clients = byDay.get(day)!;
    if (!clients.has(clientId)) {
      clients.set(clientId, { clientId, clientName: task.project.client.name, tasks: [] });
    }
    clients.get(clientId)!.tasks.push({
      id: task.id,
      title: task.title,
      status: task.status,
      projectId: task.project.id,
      projectName: task.project.name,
      stageName: primary?.stage.name ?? null,
      assigneeName: primary?.assignee?.name ?? null,
    });
  }

  const result: Record<string, MonthlyClientDemands[]> = {};
  for (const [day, clients] of byDay.entries()) {
    result[day] = Array.from(clients.values()).sort((a, b) =>
      a.clientName.localeCompare(b.clientName)
    );
  }
  return result;
}

/** Users that have a birthday and/or admission date (for the event calendar). */
export async function getTeamAnniversaries() {
  await requireManagerOrAdmin();
  return prisma.user.findMany({
    where: { OR: [{ birthday: { not: null } }, { admissionDate: { not: null } }] },
    select: { id: true, name: true, email: true, birthday: true, admissionDate: true },
    orderBy: { name: "asc" },
  });
}

// ========== Team Productivity ==========

export interface PeriodRange {
  from: Date;
  to: Date;
}

export interface TeamThroughputRow {
  teamId: string;
  teamName: string;
  completedCount: number;
  previousCompletedCount: number;
}

export async function getTeamThroughput(range: PeriodRange): Promise<TeamThroughputRow[]> {
  await requireManagerOrAdmin();
  range = periodRangeSchema.parse(range);

  const spanMs = range.to.getTime() - range.from.getTime();
  const prevFrom = new Date(range.from.getTime() - spanMs);
  const prevTo = new Date(range.from.getTime() - 1);

  const [currentLogs, previousLogs, teams] = await Promise.all([
    prisma.taskStageLog.findMany({
      where: {
        exitedAt: { gte: range.from, lte: range.to, not: null },
        status: "COMPLETED",
      },
      include: { stage: { include: { defaultTeam: true } } },
    }),
    prisma.taskStageLog.findMany({
      where: {
        exitedAt: { gte: prevFrom, lte: prevTo, not: null },
        status: "COMPLETED",
      },
      include: { stage: { include: { defaultTeam: true } } },
    }),
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // Count distinct (teamId, taskId) pairs where each task was last completed by the team
  const tally = (logs: typeof currentLogs) => {
    const seen = new Map<string, Set<string>>();
    for (const log of logs) {
      const tid = log.stage.defaultTeam?.id;
      if (!tid) continue;
      if (!seen.has(tid)) seen.set(tid, new Set());
      seen.get(tid)!.add(log.taskId);
    }
    return seen;
  };

  const current = tally(currentLogs);
  const previous = tally(previousLogs);

  return teams
    .map((team) => ({
      teamId: team.id,
      teamName: team.name,
      completedCount: current.get(team.id)?.size ?? 0,
      previousCompletedCount: previous.get(team.id)?.size ?? 0,
    }))
    .sort((a, b) => b.completedCount - a.completedCount);
}

export interface TeamLoadRow {
  teamId: string;
  teamName: string;
  inProgress: number;
  overdue: number;
  attention: number;
  onTrack: number;
}

export async function getTeamCurrentLoad(): Promise<TeamLoadRow[]> {
  await requireManagerOrAdmin();

  const { todayInSaoPaulo, daysUntil } = await import("@/lib/dates");
  const today = todayInSaoPaulo();

  const [activeStages, teams] = await Promise.all([
    prisma.taskActiveStage.findMany({
      where: { status: "ACTIVE" },
      include: {
        stage: { include: { defaultTeam: true } },
        task: { select: { id: true, dueDate: true } },
      },
    }),
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const seenByTeam = new Map<
    string,
    { tasks: Set<string>; overdue: number; attention: number; onTrack: number }
  >();

  for (const active of activeStages) {
    const tid = active.stage.defaultTeam?.id;
    if (!tid) continue;
    let bucket = seenByTeam.get(tid);
    if (!bucket) {
      bucket = { tasks: new Set(), overdue: 0, attention: 0, onTrack: 0 };
      seenByTeam.set(tid, bucket);
    }
    if (bucket.tasks.has(active.task.id)) continue;
    bucket.tasks.add(active.task.id);

    const due = active.task.dueDate;
    if (!due) {
      bucket.onTrack++;
      continue;
    }
    const delta = daysUntil(due, today);
    if (delta < 0) bucket.overdue++;
    else if (delta <= 2) bucket.attention++;
    else bucket.onTrack++;
  }

  return teams
    .map((team) => {
      const b = seenByTeam.get(team.id);
      return {
        teamId: team.id,
        teamName: team.name,
        inProgress: b?.tasks.size ?? 0,
        overdue: b?.overdue ?? 0,
        attention: b?.attention ?? 0,
        onTrack: b?.onTrack ?? 0,
      };
    })
    .sort((a, b) => b.inProgress - a.inProgress);
}

export interface StageDurationRow {
  stageId: string;
  stageName: string;
  templateName: string;
  avgDurationHours: number;
  sampleSize: number;
  /** SLA target in hours (null = no SLA defined for this stage). */
  expectedDurationHours: number | null;
  /** Whether the average duration is within the SLA target (null when no SLA). */
  withinSla: boolean | null;
}

export async function getStageDuration(range: PeriodRange): Promise<StageDurationRow[]> {
  await requireManagerOrAdmin();
  range = periodRangeSchema.parse(range);

  const MIN_SAMPLE = 3;

  const logs = await prisma.taskStageLog.findMany({
    where: {
      enteredAt: { gte: range.from, lte: range.to },
      exitedAt: { not: null },
      status: "COMPLETED",
    },
    include: { stage: { include: { template: true } } },
  });

  const grouped = new Map<
    string,
    { name: string; template: string; expected: number | null; durations: number[] }
  >();

  for (const log of logs) {
    if (!log.exitedAt) continue;
    const durationMs = log.exitedAt.getTime() - log.enteredAt.getTime();
    if (durationMs <= 0) continue;
    const key = log.stage.id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: log.stage.name,
        template: log.stage.template.name,
        expected: log.stage.expectedDurationHours ?? null,
        durations: [],
      });
    }
    grouped.get(key)!.durations.push(durationMs);
  }

  return Array.from(grouped.entries())
    .filter(([, v]) => v.durations.length >= MIN_SAMPLE)
    .map(([id, v]) => {
      const sum = v.durations.reduce((a, b) => a + b, 0);
      const avgMs = sum / v.durations.length;
      const avgDurationHours = avgMs / (1000 * 60 * 60);
      return {
        stageId: id,
        stageName: v.name,
        templateName: v.template,
        avgDurationHours,
        sampleSize: v.durations.length,
        expectedDurationHours: v.expected,
        withinSla: v.expected === null ? null : avgDurationHours <= v.expected,
      };
    })
    .sort((a, b) => b.avgDurationHours - a.avgDurationHours);
}

export interface OnTimeRateResult {
  overall: { onTime: number; total: number; percentage: number };
  previousPercentage: number;
  byTeam: { teamId: string; teamName: string; onTime: number; total: number; percentage: number }[];
}

export async function getOnTimeRate(range: PeriodRange): Promise<OnTimeRateResult> {
  await requireManagerOrAdmin();
  range = periodRangeSchema.parse(range);

  const spanMs = range.to.getTime() - range.from.getTime();
  const prevFrom = new Date(range.from.getTime() - spanMs);
  const prevTo = new Date(range.from.getTime() - 1);

  const computeRate = async (from: Date, to: Date) => {
    const tasks = await prisma.task.findMany({
      where: {
        completedAt: { gte: from, lte: to, not: null },
        dueDate: { not: null },
      },
      select: {
        id: true,
        dueDate: true,
        completedAt: true,
        activeStages: {
          where: { status: "COMPLETED" },
          orderBy: { stage: { order: "desc" } },
          take: 1,
          include: { stage: { include: { defaultTeam: true } } },
        },
      },
    });
    return tasks;
  };

  const [currentTasks, previousTasks] = await Promise.all([
    computeRate(range.from, range.to),
    computeRate(prevFrom, prevTo),
  ]);

  const rate = (tasks: typeof currentTasks) => {
    const total = tasks.length;
    const onTime = tasks.filter(
      (t) => t.completedAt && t.dueDate && t.completedAt <= t.dueDate
    ).length;
    return { total, onTime, percentage: total === 0 ? 0 : (onTime / total) * 100 };
  };

  const overall = rate(currentTasks);
  const previous = rate(previousTasks);

  const byTeamMap = new Map<string, { teamName: string; onTime: number; total: number }>();
  for (const t of currentTasks) {
    const lastStage = t.activeStages[0];
    const team = lastStage?.stage.defaultTeam;
    if (!team) continue;
    const key = team.id;
    if (!byTeamMap.has(key)) {
      byTeamMap.set(key, { teamName: team.name, onTime: 0, total: 0 });
    }
    const bucket = byTeamMap.get(key)!;
    bucket.total++;
    if (t.completedAt && t.dueDate && t.completedAt <= t.dueDate) bucket.onTime++;
  }

  const byTeam = Array.from(byTeamMap.entries())
    .map(([teamId, v]) => ({
      teamId,
      teamName: v.teamName,
      onTime: v.onTime,
      total: v.total,
      percentage: v.total === 0 ? 0 : (v.onTime / v.total) * 100,
    }))
    .sort((a, b) => b.percentage - a.percentage);

  return {
    overall,
    previousPercentage: previous.percentage,
    byTeam,
  };
}

// ========== Individual Collaborator Report ==========

export interface UserProductivityReport {
  user: { id: string; name: string | null; email: string | null } | null;
  totalHours: number;
  stagesCompleted: number;
  onTime: { onTime: number; total: number; percentage: number };
  hoursByStage: { stageId: string; stageName: string; totalHours: number }[];
}

/**
 * Per-collaborator productivity for the dedicated report page: total hours
 * logged, hours broken down by stage, stages completed, and on-time completion
 * rate — all scoped to one user within a period. Manager/Admin only.
 */
export async function getUserProductivityReport(
  userId: string,
  range: PeriodRange
): Promise<UserProductivityReport> {
  await requireManagerOrAdmin();
  const uid = z.string().min(1).parse(userId);
  range = periodRangeSchema.parse(range);

  const [user, timeLogs, completedLogs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: uid },
      select: { id: true, name: true, email: true },
    }),
    prisma.timeLog.findMany({
      where: { userId: uid, logDate: { gte: range.from, lte: range.to } },
      select: { hoursSpent: true, stageId: true, stage: { select: { name: true } } },
    }),
    // Stages this user completed in the period, with the parent task's dates for
    // the on-time calculation.
    prisma.taskStageLog.findMany({
      where: {
        userId: uid,
        status: "COMPLETED",
        exitedAt: { gte: range.from, lte: range.to },
      },
      select: { exitedAt: true, task: { select: { dueDate: true } } },
    }),
  ]);

  let totalHours = 0;
  const byStage = new Map<string, { stageName: string; totalHours: number }>();
  for (const log of timeLogs) {
    totalHours += log.hoursSpent;
    const key = log.stageId ?? "__none__";
    const entry = byStage.get(key) ?? { stageName: log.stage?.name ?? "—", totalHours: 0 };
    entry.totalHours += log.hoursSpent;
    byStage.set(key, entry);
  }

  let onTimeCount = 0;
  for (const log of completedLogs) {
    const due = log.task.dueDate;
    if (due && log.exitedAt && log.exitedAt <= due) onTimeCount++;
  }
  const total = completedLogs.length;

  return {
    user,
    totalHours,
    stagesCompleted: total,
    onTime: {
      onTime: onTimeCount,
      total,
      percentage: total === 0 ? 0 : (onTimeCount / total) * 100,
    },
    hoursByStage: Array.from(byStage.entries())
      .map(([stageId, v]) => ({ stageId, stageName: v.stageName, totalHours: v.totalHours }))
      .sort((a, b) => b.totalHours - a.totalHours),
  };
}
