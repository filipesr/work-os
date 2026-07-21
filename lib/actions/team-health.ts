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
