"use server";

import prisma from "@/lib/prisma";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { formatISODate } from "@/lib/dates";

// ========== Productivity Report (TimeLog Aggregations) ==========

export interface ProductivityFilters {
  startDate?: Date;
  endDate?: Date;
  projectId?: string;
  userId?: string;
  clientId?: string;
}

export interface HoursByUser {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  totalHours: number;
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
 * Get total hours logged grouped by user
 */
export async function getHoursByUser(filters: ProductivityFilters = {}) {
  // Require MANAGER or ADMIN role
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

  const where: any = {};

  if (filters.startDate || filters.endDate) {
    where.logDate = {};
    if (filters.startDate) {
      where.logDate.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.logDate.lte = filters.endDate;
    }
  }

  if (filters.projectId) {
    where.task = { projectId: filters.projectId };
  }

  if (filters.userId) {
    where.userId = filters.userId;
  }

  const timeLogs = await prisma.timeLog.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  // Group by user
  const grouped = timeLogs.reduce((acc: any, log) => {
    const userId = log.userId;
    if (!acc[userId]) {
      acc[userId] = {
        userId,
        userName: log.user.name,
        userEmail: log.user.email,
        totalHours: 0,
      };
    }
    acc[userId].totalHours += log.hoursSpent;
    return acc;
  }, {});

  return Object.values(grouped) as HoursByUser[];
}

/**
 * Get total hours logged grouped by project
 */
export async function getHoursByProject(filters: ProductivityFilters = {}) {
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

  const where: any = {};

  if (filters.startDate || filters.endDate) {
    where.logDate = {};
    if (filters.startDate) {
      where.logDate.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.logDate.lte = filters.endDate;
    }
  }

  if (filters.projectId) {
    where.task = { projectId: filters.projectId };
  }

  if (filters.userId) {
    where.userId = filters.userId;
  }

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
  const grouped = timeLogs.reduce((acc: any, log) => {
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
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

  const where: any = {};

  if (filters.startDate || filters.endDate) {
    where.logDate = {};
    if (filters.startDate) {
      where.logDate.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.logDate.lte = filters.endDate;
    }
  }

  if (filters.clientId) {
    where.task = {
      project: {
        clientId: filters.clientId,
      },
    };
  }

  if (filters.userId) {
    where.userId = filters.userId;
  }

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
  const grouped = timeLogs.reduce((acc: any, log) => {
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
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

  const where: any = {};

  if (filters.startDate || filters.endDate) {
    where.logDate = {};
    if (filters.startDate) {
      where.logDate.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.logDate.lte = filters.endDate;
    }
  }

  if (filters.projectId) {
    where.task = { projectId: filters.projectId };
  }

  if (filters.userId) {
    where.userId = filters.userId;
  }

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
  const grouped = timeLogs.reduce((acc: any, log) => {
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

/**
 * Calculate average time spent in each workflow stage
 * This identifies bottlenecks in the workflow
 */
export async function getAverageTimePerStage(filters: PerformanceFilters = {}) {
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

  const where: any = {
    exitedAt: { not: null }, // Only completed stages
  };

  if (filters.startDate || filters.endDate) {
    where.enteredAt = {};
    if (filters.startDate) {
      where.enteredAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.enteredAt.lte = filters.endDate;
    }
  }

  if (filters.templateId) {
    where.stage = {
      templateId: filters.templateId,
    };
  }

  if (filters.projectId) {
    where.task = {
      projectId: filters.projectId,
    };
  }

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
  const stageData: any = {};

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
  const results: AverageTimePerStage[] = Object.values(stageData).map((data: any) => ({
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
 * Calculate rework rate (how often tasks are reverted) per stage
 * This measures quality and identifies problematic stages
 */
export async function getReworkRateByStage(filters: PerformanceFilters = {}) {
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

  const where: any = {
    exitedAt: { not: null },
    status: { not: null }, // Only logs with status set
  };

  if (filters.startDate || filters.endDate) {
    where.enteredAt = {};
    if (filters.startDate) {
      where.enteredAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.enteredAt.lte = filters.endDate;
    }
  }

  if (filters.templateId) {
    where.stage = {
      templateId: filters.templateId,
    };
  }

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
  const stageData: any = {};

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
  const results: ReworkRateByStage[] = Object.values(stageData).map((data: any) => {
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

/**
 * Calculate lead time metrics (time from task creation to completion)
 */
export async function getLeadTimeMetrics(filters: PerformanceFilters = {}) {
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

  const where: any = {
    completedAt: { not: null }, // Only completed tasks
  };

  if (filters.startDate || filters.endDate) {
    where.completedAt = {};
    if (filters.startDate) {
      where.completedAt.gte = filters.startDate;
    }
    if (filters.endDate) {
      where.completedAt.lte = filters.endDate;
    }
  }

  if (filters.projectId) {
    where.projectId = filters.projectId;
  }

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
  status: "BACKLOG" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
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
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

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
  status: "BACKLOG" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";
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
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

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
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);
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
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

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
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

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
}

export async function getStageDuration(range: PeriodRange): Promise<StageDurationRow[]> {
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

  const MIN_SAMPLE = 3;

  const logs = await prisma.taskStageLog.findMany({
    where: {
      enteredAt: { gte: range.from, lte: range.to },
      exitedAt: { not: null },
      status: "COMPLETED",
    },
    include: { stage: { include: { template: true } } },
  });

  const grouped = new Map<string, { name: string; template: string; durations: number[] }>();

  for (const log of logs) {
    if (!log.exitedAt) continue;
    const durationMs = log.exitedAt.getTime() - log.enteredAt.getTime();
    if (durationMs <= 0) continue;
    const key = log.stage.id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: log.stage.name,
        template: log.stage.template.name,
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
      return {
        stageId: id,
        stageName: v.name,
        templateName: v.template,
        avgDurationHours: avgMs / (1000 * 60 * 60),
        sampleSize: v.durations.length,
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
  await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);

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
