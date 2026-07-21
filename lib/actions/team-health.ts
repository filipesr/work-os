import prisma from "@/lib/prisma";
import { requireManagerOrAdmin, getSessionUser } from "@/lib/permissions";

export const OVERLOAD_CEILING = 8;
export const OVERLOAD_MARGIN = 3;
export const IDLE_THRESHOLD = 1;
export const DEFAULT_SLA_HOURS = 72;
export const AGING_ALERT_RATIO = 1.0;
export const QUEUE_LIMIT = 6;

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
        overloaded: b.count >= OVERLOAD_CEILING || b.count >= med + OVERLOAD_MARGIN,
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
