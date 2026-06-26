"use server";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";

export type StageWithTeam = {
  id: string;
  defaultTeamId: string | null;
  defaultTeam: { members: { id: string }[] } | null;
};

/** True when `assigneeId` belongs to the stage's defaultTeam. Stages without a
 * team cannot be assigned. */
export function isValidStageAssignee(stage: StageWithTeam, assigneeId: string): boolean {
  if (!stage.defaultTeam) return false;
  return stage.defaultTeam.members.some((m) => m.id === assigneeId);
}

/** Reads `assignee:<stageId>` form fields into a { stageId: assigneeId } map,
 * skipping empty values (= "no assignment"). */
export function parseStageAssignments(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("assignee:")) continue;
    const stageId = key.slice("assignee:".length);
    const assigneeId = typeof value === "string" ? value.trim() : "";
    if (stageId && assigneeId) out[stageId] = assigneeId;
  }
  return out;
}

/** Members of a team, for the per-stage assignee selector. */
export async function getTeamMembers(
  teamId: string
): Promise<{ id: string; name: string | null; email: string | null }[]> {
  await requireMemberOrHigher();
  if (!teamId) return [];
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      members: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" } },
    },
  });
  return team?.members ?? [];
}

/** Pre-creates ALL template stages for a task as TaskActiveStage rows.
 * Stages with no dependencies start ACTIVE; the rest start INACTIVE.
 * Assignments are applied only when valid (assignee ∈ stage.defaultTeam).
 * A TaskStageLog is opened only for the initial ACTIVE stages. */
export async function createTaskStages(
  tx: Prisma.TransactionClient,
  args: { taskId: string; templateId: string; userId: string; assignments?: Record<string, string> }
): Promise<void> {
  const { taskId, templateId, userId, assignments = {} } = args;

  const stages = await tx.templateStage.findMany({
    where: { templateId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      defaultTeamId: true,
      dependencies: { select: { id: true } },
      defaultTeam: { select: { members: { select: { id: true } } } },
    },
  });

  if (stages.length === 0) {
    throw new Error("Template is misconfigured; no stages found.");
  }

  for (const stage of stages) {
    const isStart = stage.dependencies.length === 0;
    const requested = assignments[stage.id];
    const assigneeId = requested && isValidStageAssignee(stage, requested) ? requested : null;

    await tx.taskActiveStage.create({
      data: {
        taskId,
        stageId: stage.id,
        status: isStart ? "ACTIVE" : "INACTIVE",
        assigneeId,
      },
    });

    if (isStart) {
      await tx.taskStageLog.create({
        data: { taskId, stageId: stage.id, enteredAt: new Date(), exitedAt: null, userId },
      });
    }
  }
}
