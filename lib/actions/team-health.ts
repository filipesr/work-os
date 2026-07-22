import prisma from "@/lib/prisma";
import { requireManagerOrAdmin, getSessionUser } from "@/lib/permissions";

export const OVERLOAD_CEILING = 8;
export const OVERLOAD_MARGIN = 3;
// A regra relativa (acima da mediana) só vale quando a mediana do time é
// significativa — evita flagar "sobrecarga" num time majoritariamente ocioso
// (mediana ~0, onde qualquer um com poucas etapas viraria falso positivo).
export const OVERLOAD_RELATIVE_MIN_MEDIAN = 2;
export const IDLE_THRESHOLD = 1;
export const DEFAULT_SLA_HOURS = 72;
export const AGING_ALERT_RATIO = 1.0;
export const QUEUE_LIMIT = 6;

// Burnout signal calibration (indicative — Gallup gives the aggregate, not the
// individual trigger). Sustained high utilization / repeated overtime over the
// window is the pattern the literature ties to burnout risk.
export const BURNOUT_WINDOW_WEEKS = 4;
export const BURNOUT_UTIL_HIGH = 0.9; // avg utilization over the window
export const BURNOUT_UTIL_MED = 0.75;
export const BURNOUT_OVERTIME_WEEKS_HIGH = 2; // weeks logged above capacity

// 1:1 cadence: a member with no 1:1 in this many days is "overdue".
export const ONE_ON_ONE_OVERDUE_DAYS = 30;

export interface MemberLoad {
  userId: string;
  name: string;
  count: number;
  onTrack: number;
  dueSoon: number;
  overdue: number;
  overloaded: boolean;
  idle: boolean;
}

export interface AgingItem {
  taskId: string;
  taskTitle: string;
  stageName: string;
  assigneeName: string | null;
  ageHours: number;
  slaHours: number;
  agingRatio: number;
  dueState: "overdue" | "dueSoon" | "none";
}

export interface BlockedItem {
  taskId: string;
  taskTitle: string;
  stageName: string;
  assigneeName: string | null;
  ageHours: number;
  waitingOn: string[];
}

export interface SystemConstraint {
  stageId: string;
  stageName: string;
  blockedTaskCount: number; // distinct downstream tasks waiting on this stage
  totalWaitHours: number; // accumulated wait of those blocked items
}

export interface WipStageStatus {
  stageId: string;
  stageName: string;
  teamName: string | null;
  inProgress: number; // ACTIVE + assigned instances of this stage
  limit: number;
  state: "full" | "over"; // full = at limit, over = breached
}

export interface BurnoutSignal {
  userId: string;
  name: string;
  avgUtilization: number | null; // over the window; null when no capacity target
  overtimeWeeks: number; // weeks logged above capacity
  wipCount: number; // current ACTIVE assigned stages
  risk: "medium" | "high";
}

export interface OneOnOneCadenceRow {
  userId: string;
  name: string;
  lastOneOnOne: string | null; // ISO date, or null if never
  daysSince: number | null;
  overdue: boolean;
}

/** Median of a numeric list (0 for empty). Pure helper. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Team ids in scope: all teams for ADMIN, else the current user's teams. */
export async function resolveTeamIds(): Promise<string[]> {
  const user = await getSessionUser();
  if (user.role === "ADMIN") {
    const teams = await prisma.team.findMany({ select: { id: true } });
    return teams.map((t) => t.id);
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { teams: { select: { id: true } } },
  });
  return dbUser?.teams.map((t) => t.id) ?? [];
}

export async function getTeamMemberLoad(teamIds?: string[]): Promise<MemberLoad[]> {
  await requireManagerOrAdmin();
  const scope = teamIds ?? (await resolveTeamIds());
  const { getDueState } = await import("@/lib/dates");

  const members = await prisma.user.findMany({
    where: { teams: { some: { id: { in: scope } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const memberIds = members.map((m) => m.id);

  const stages = await prisma.taskActiveStage.findMany({
    where: { status: "ACTIVE", assigneeId: { in: memberIds } },
    select: { assigneeId: true, task: { select: { dueDate: true } } },
  });

  const tally = new Map<
    string,
    { count: number; onTrack: number; dueSoon: number; overdue: number }
  >();
  for (const m of members) tally.set(m.id, { count: 0, onTrack: 0, dueSoon: 0, overdue: 0 });
  for (const s of stages) {
    if (!s.assigneeId) continue;
    const b = tally.get(s.assigneeId);
    if (!b) continue;
    b.count++;
    const state = getDueState(s.task.dueDate);
    if (state === "overdue") b.overdue++;
    else if (state === "dueSoon") b.dueSoon++;
    else b.onTrack++;
  }

  const med = median(members.map((m) => tally.get(m.id)!.count));

  return members
    .map((m) => {
      const b = tally.get(m.id)!;
      return {
        userId: m.id,
        name: m.name ?? "—",
        count: b.count,
        onTrack: b.onTrack,
        dueSoon: b.dueSoon,
        overdue: b.overdue,
        overloaded:
          b.count >= OVERLOAD_CEILING ||
          (med >= OVERLOAD_RELATIVE_MIN_MEDIAN && b.count >= med + OVERLOAD_MARGIN),
        idle: b.count <= IDLE_THRESHOLD,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export async function getAgingStages(teamIds?: string[]): Promise<AgingItem[]> {
  await requireManagerOrAdmin();
  const scope = teamIds ?? (await resolveTeamIds());
  const { getDueState } = await import("@/lib/dates");
  const now = Date.now();

  const stages = await prisma.taskActiveStage.findMany({
    where: { status: "ACTIVE", stage: { defaultTeamId: { in: scope } } },
    select: {
      activatedAt: true,
      task: { select: { id: true, title: true, dueDate: true } },
      stage: { select: { name: true, expectedDurationHours: true } },
      assignee: { select: { name: true } },
    },
  });

  return stages
    .map((s): AgingItem => {
      const ageHours = (now - s.activatedAt.getTime()) / 3.6e6;
      const slaHours = s.stage.expectedDurationHours ?? DEFAULT_SLA_HOURS;
      return {
        taskId: s.task.id,
        taskTitle: s.task.title,
        stageName: s.stage.name,
        assigneeName: s.assignee?.name ?? null,
        ageHours,
        slaHours,
        agingRatio: ageHours / slaHours,
        dueState: getDueState(s.task.dueDate),
      };
    })
    .filter((i) => i.agingRatio >= AGING_ALERT_RATIO || i.dueState !== "none")
    .sort((a, b) => b.agingRatio - a.agingRatio);
}

export async function getBlockedStages(teamIds?: string[]): Promise<BlockedItem[]> {
  await requireManagerOrAdmin();
  const scope = teamIds ?? (await resolveTeamIds());
  const now = Date.now();

  const blocked = await prisma.taskActiveStage.findMany({
    where: { status: "BLOCKED", stage: { defaultTeamId: { in: scope } } },
    select: {
      stageId: true,
      activatedAt: true,
      blockedAt: true,
      task: { select: { id: true, title: true } },
      stage: { select: { name: true } },
      assignee: { select: { name: true } },
    },
  });
  if (blocked.length === 0) return [];

  const taskIds = [...new Set(blocked.map((b) => b.task.id))];
  const blockedStageIds = [...new Set(blocked.map((b) => b.stageId))];

  const [completedRows, prereqRows] = await Promise.all([
    prisma.taskActiveStage.findMany({
      where: { taskId: { in: taskIds }, status: "COMPLETED" },
      select: { taskId: true, stageId: true },
    }),
    prisma.stageDependency.findMany({
      where: { stageId: { in: blockedStageIds } },
      select: { stageId: true, dependsOnStageId: true },
    }),
  ]);

  // task -> set of completed stage ids
  const completedByTask = new Map<string, Set<string>>();
  for (const c of completedRows) {
    const set = completedByTask.get(c.taskId) ?? new Set<string>();
    set.add(c.stageId);
    completedByTask.set(c.taskId, set);
  }
  // blocked stage -> its prerequisite stage ids
  const prereqsByStage = new Map<string, string[]>();
  for (const p of prereqRows) {
    const arr = prereqsByStage.get(p.stageId) ?? [];
    arr.push(p.dependsOnStageId);
    prereqsByStage.set(p.stageId, arr);
  }
  // names for prerequisite stages
  const prereqIds = [...new Set(prereqRows.map((p) => p.dependsOnStageId))];
  const names = prereqIds.length
    ? await prisma.templateStage.findMany({
        where: { id: { in: prereqIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(names.map((n) => [n.id, n.name]));

  return blocked
    .map((b): BlockedItem => {
      const completed = completedByTask.get(b.task.id) ?? new Set<string>();
      const waitingOn = (prereqsByStage.get(b.stageId) ?? [])
        .filter((depId) => !completed.has(depId))
        .map((depId) => nameById.get(depId) ?? "—");
      return {
        taskId: b.task.id,
        taskTitle: b.task.title,
        stageName: b.stage.name,
        assigneeName: b.assignee?.name ?? null,
        // Severidade = tempo desde que entrou em BLOCKED; fallback p/ activatedAt.
        ageHours: (now - (b.blockedAt ?? b.activatedAt).getTime()) / 3.6e6,
        waitingOn,
      };
    })
    .sort((a, b) => b.ageHours - a.ageHours);
}

/**
 * WIP-limit status for stages that have a limit set: how many items are in
 * progress (ACTIVE + assigned) vs the limit. Returns only stages at (`full`) or
 * over (`over`) their limit — the breaches worth surfacing. Auto-activation
 * never blocks, so `over` arises from direct admin assignment or a lowered
 * limit. Scoped by the stage's team.
 */
export async function getWipStatus(teamIds?: string[]): Promise<WipStageStatus[]> {
  await requireManagerOrAdmin();
  const scope = teamIds ?? (await resolveTeamIds());

  const stages = await prisma.templateStage.findMany({
    where: { wipLimit: { not: null }, defaultTeamId: { in: scope } },
    select: { id: true, name: true, wipLimit: true, defaultTeam: { select: { name: true } } },
  });
  if (stages.length === 0) return [];

  const counts = await prisma.taskActiveStage.groupBy({
    by: ["stageId"],
    where: {
      stageId: { in: stages.map((s) => s.id) },
      status: "ACTIVE",
      assigneeId: { not: null },
    },
    _count: { _all: true },
  });
  const countByStage = new Map(counts.map((c) => [c.stageId, c._count._all]));

  return stages
    .map((s): WipStageStatus | null => {
      const limit = s.wipLimit!;
      const inProgress = countByStage.get(s.id) ?? 0;
      if (inProgress < limit) return null; // within limit — nothing to surface
      return {
        stageId: s.id,
        stageName: s.name,
        teamName: s.defaultTeam?.name ?? null,
        inProgress,
        limit,
        state: inProgress > limit ? "over" : "full",
      };
    })
    .filter((s): s is WipStageStatus => s !== null)
    .sort((a, b) => b.inProgress - b.limit - (a.inProgress - a.limit));
}

/**
 * The system constraint (Theory of Constraints): the single UNFINISHED
 * prerequisite stage that most blocks downstream work right now — i.e. the
 * inversion of getBlockedStages' `waitingOn`. Each blocked item's wait time is
 * attributed to each of its pending prerequisites; the prerequisite with the
 * most accumulated downstream wait (tiebreak: most distinct tasks) is the
 * constraint. Finishing work there unblocks the most/longest-waiting work,
 * which — per ToC — is the fastest way to raise system throughput. Returns null
 * when nothing is blocked (no active constraint). Scoped like getBlockedStages
 * (by the blocked stage's team); the constraint itself may belong to any team.
 */
export async function getSystemConstraint(teamIds?: string[]): Promise<SystemConstraint | null> {
  await requireManagerOrAdmin();
  const scope = teamIds ?? (await resolveTeamIds());
  const now = Date.now();

  const blocked = await prisma.taskActiveStage.findMany({
    where: { status: "BLOCKED", stage: { defaultTeamId: { in: scope } } },
    select: {
      stageId: true,
      activatedAt: true,
      blockedAt: true,
      task: { select: { id: true } },
    },
  });
  if (blocked.length === 0) return null;

  const taskIds = [...new Set(blocked.map((b) => b.task.id))];
  const blockedStageIds = [...new Set(blocked.map((b) => b.stageId))];

  const [completedRows, prereqRows] = await Promise.all([
    prisma.taskActiveStage.findMany({
      where: { taskId: { in: taskIds }, status: "COMPLETED" },
      select: { taskId: true, stageId: true },
    }),
    prisma.stageDependency.findMany({
      where: { stageId: { in: blockedStageIds } },
      select: { stageId: true, dependsOnStageId: true },
    }),
  ]);

  const completedByTask = new Map<string, Set<string>>();
  for (const c of completedRows) {
    const set = completedByTask.get(c.taskId) ?? new Set<string>();
    set.add(c.stageId);
    completedByTask.set(c.taskId, set);
  }
  const prereqsByStage = new Map<string, string[]>();
  for (const p of prereqRows) {
    const arr = prereqsByStage.get(p.stageId) ?? [];
    arr.push(p.dependsOnStageId);
    prereqsByStage.set(p.stageId, arr);
  }

  // Attribute each blocked item's wait to each of its PENDING prerequisites.
  const tally = new Map<string, { tasks: Set<string>; waitHours: number }>();
  for (const b of blocked) {
    const completed = completedByTask.get(b.task.id) ?? new Set<string>();
    const waitHours = (now - (b.blockedAt ?? b.activatedAt).getTime()) / 3.6e6;
    const pending = (prereqsByStage.get(b.stageId) ?? []).filter((dep) => !completed.has(dep));
    for (const depId of pending) {
      const agg = tally.get(depId) ?? { tasks: new Set<string>(), waitHours: 0 };
      agg.tasks.add(b.task.id);
      agg.waitHours += waitHours;
      tally.set(depId, agg);
    }
  }
  if (tally.size === 0) return null;

  let bestId: string | null = null;
  let best = { tasks: new Set<string>(), waitHours: 0 };
  for (const [id, agg] of tally) {
    const wins =
      agg.waitHours > best.waitHours ||
      (agg.waitHours === best.waitHours && agg.tasks.size > best.tasks.size);
    if (wins) {
      bestId = id;
      best = agg;
    }
  }
  if (!bestId) return null;

  const stage = await prisma.templateStage.findUnique({
    where: { id: bestId },
    select: { name: true },
  });

  return {
    stageId: bestId,
    stageName: stage?.name ?? "—",
    blockedTaskCount: best.tasks.size,
    totalWaitHours: best.waitHours,
  };
}

/**
 * Burnout risk signals: per team member, the SUSTAINED-overload pattern the
 * literature ties to burnout (Gallup), derived from data that already exists —
 * utilization (TimeLog ÷ weeklyCapacityHours over the last BURNOUT_WINDOW_WEEKS),
 * weeks logged above capacity (overtime), and current WIP. Returns only members
 * at medium/high risk, high first. Indicative, not a diagnosis.
 */
export async function getBurnoutSignals(teamIds?: string[]): Promise<BurnoutSignal[]> {
  await requireManagerOrAdmin();
  const scope = teamIds ?? (await resolveTeamIds());

  const members = await prisma.user.findMany({
    where: { teams: { some: { id: { in: scope } } } },
    select: { id: true, name: true, weeklyCapacityHours: true },
  });
  if (members.length === 0) return [];
  const memberIds = members.map((m) => m.id);

  const windowMs = BURNOUT_WINDOW_WEEKS * 7 * 24 * 3.6e6;
  const from = new Date(Date.now() - windowMs);

  const [logs, wip] = await Promise.all([
    prisma.timeLog.findMany({
      where: { userId: { in: memberIds }, logDate: { gte: from } },
      select: { userId: true, hoursSpent: true, logDate: true },
    }),
    prisma.taskActiveStage.groupBy({
      by: ["assigneeId"],
      where: { status: "ACTIVE", assigneeId: { in: memberIds } },
      _count: { _all: true },
    }),
  ]);

  // Weekly hour buckets per user (index 0..WINDOW-1).
  const fromDay = from.getTime();
  const weekMs = 7 * 24 * 3.6e6;
  const weeklyByUser = new Map<string, number[]>();
  for (const m of members) weeklyByUser.set(m.id, new Array(BURNOUT_WINDOW_WEEKS).fill(0));
  for (const l of logs) {
    const idx = Math.floor((l.logDate.getTime() - fromDay) / weekMs);
    const arr = weeklyByUser.get(l.userId);
    if (arr && idx >= 0 && idx < BURNOUT_WINDOW_WEEKS) arr[idx] += l.hoursSpent;
  }
  const wipByUser = new Map(wip.map((w) => [w.assigneeId, w._count._all]));

  const out: BurnoutSignal[] = [];
  for (const m of members) {
    const weeks = weeklyByUser.get(m.id)!;
    const total = weeks.reduce((a, b) => a + b, 0);
    const wipCount = wipByUser.get(m.id) ?? 0;

    let avgUtilization: number | null = null;
    let overtimeWeeks = 0;
    if (m.weeklyCapacityHours && m.weeklyCapacityHours > 0) {
      avgUtilization = total / (m.weeklyCapacityHours * BURNOUT_WINDOW_WEEKS);
      overtimeWeeks = weeks.filter((h) => h > m.weeklyCapacityHours!).length;
    }

    const isHigh =
      (avgUtilization != null && avgUtilization > BURNOUT_UTIL_HIGH) ||
      overtimeWeeks >= BURNOUT_OVERTIME_WEEKS_HIGH;
    const isMed =
      (avgUtilization != null && avgUtilization > BURNOUT_UTIL_MED) || wipCount >= OVERLOAD_CEILING;

    if (!isHigh && !isMed) continue;
    out.push({
      userId: m.id,
      name: m.name ?? "—",
      avgUtilization,
      overtimeWeeks,
      wipCount,
      risk: isHigh ? "high" : "medium",
    });
  }

  return out.sort((a, b) => {
    if (a.risk !== b.risk) return a.risk === "high" ? -1 : 1;
    return (b.avgUtilization ?? 0) - (a.avgUtilization ?? 0);
  });
}

/**
 * 1:1 cadence per team member: the date of their most recent 1:1, days since,
 * and whether it is overdue (> ONE_ON_ONE_OVERDUE_DAYS, or never held). Overdue
 * first, then longest-waiting. The Gallup-grounded people-management lever.
 */
export async function getOneOnOneCadence(teamIds?: string[]): Promise<OneOnOneCadenceRow[]> {
  await requireManagerOrAdmin();
  const scope = teamIds ?? (await resolveTeamIds());

  const members = await prisma.user.findMany({
    where: { teams: { some: { id: { in: scope } } } },
    select: {
      id: true,
      name: true,
      oneOnOnesReceived: {
        orderBy: { occurredAt: "desc" },
        take: 1,
        select: { occurredAt: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const now = Date.now();
  return members
    .map((m): OneOnOneCadenceRow => {
      const last = m.oneOnOnesReceived[0]?.occurredAt ?? null;
      const daysSince = last ? Math.floor((now - last.getTime()) / 8.64e7) : null;
      return {
        userId: m.id,
        name: m.name ?? "—",
        lastOneOnOne: last ? last.toISOString() : null,
        daysSince,
        overdue: daysSince === null || daysSince > ONE_ON_ONE_OVERDUE_DAYS,
      };
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity);
    });
}
