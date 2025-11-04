"use server";

import prisma from "@/lib/prisma";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";

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

    const durationMs =
      new Date(log.exitedAt).getTime() - new Date(log.enteredAt).getTime();
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
  const results: AverageTimePerStage[] = Object.values(stageData).map(
    (data: any) => ({
      stageId: data.stageId,
      stageName: data.stageName,
      templateName: data.templateName,
      averageDurationHours: data.totalDurationHours / data.count,
      averageDurationDays: data.totalDurationHours / data.count / 24,
      count: data.count,
    })
  );

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
  const results: ReworkRateByStage[] = Object.values(stageData).map(
    (data: any) => {
      const total = data.completed + data.reverted;
      return {
        stageId: data.stageId,
        stageName: data.stageName,
        templateName: data.templateName,
        completed: data.completed,
        reverted: data.reverted,
        reworkRate: total > 0 ? data.reverted / total : 0,
      };
    }
  );

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
    const durationMs =
      new Date(task.completedAt!).getTime() -
      new Date(task.createdAt).getTime();
    return durationMs / (1000 * 60 * 60 * 24); // Convert to days
  });

  // Calculate average
  const averageLeadTimeDays =
    leadTimes.reduce((sum, time) => sum + time, 0) / leadTimes.length;

  // Calculate median
  const sorted = leadTimes.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianLeadTimeDays =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return {
    averageLeadTimeDays,
    medianLeadTimeDays,
    count: tasks.length,
  };
}
