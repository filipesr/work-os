"use server";

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { resolveTeamIds } from "@/lib/actions/team-health";
import { getDueState } from "@/lib/dates";
import type { MemberStage } from "@/lib/team-health-format";

/**
 * Active stages assigned to `userId`, for the admin load drill-down drawer.
 * Fail-closed: returns [] unless the target user shares a team with the caller's
 * scope (ADMIN → all teams; MANAGER → only their own).
 */
export async function getMemberActiveStages(userId: string): Promise<MemberStage[]> {
  await requireManagerOrAdmin();
  const scope = await resolveTeamIds();

  const inScope = await prisma.user.findFirst({
    where: { id: userId, teams: { some: { id: { in: scope } } } },
    select: { id: true },
  });
  if (!inScope) return [];

  const stages = await prisma.taskActiveStage.findMany({
    where: { status: "ACTIVE", assigneeId: userId },
    select: {
      activatedAt: true,
      task: { select: { id: true, title: true, createdAt: true, dueDate: true } },
      stage: { select: { name: true } },
    },
    orderBy: { task: { dueDate: "asc" } },
  });

  return stages.map((s) => ({
    taskId: s.task.id,
    taskTitle: s.task.title,
    stageName: s.stage.name,
    createdAt: s.task.createdAt.toISOString(),
    assignedAt: s.activatedAt.toISOString(),
    dueDate: s.task.dueDate ? s.task.dueDate.toISOString() : null,
    dueState: getDueState(s.task.dueDate),
  }));
}
