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

export type PreviewStage = {
  id: string;
  name: string;
  order: number;
  defaultTeamId: string | null;
  defaultTeam: { name: string } | null;
};

/**
 * Read-only preview of which stages will be activated or blocked when
 * `completedStageId` is completed. Does NOT mutate anything.
 * Used by the advance-stage modal to show next stages before confirmation.
 */
export async function previewNextStages(
  taskId: string,
  completedStageId: string
): Promise<{ activated: PreviewStage[]; blocked: PreviewStage[] }> {
  await requireMemberOrHigher();

  // Stages that list completedStageId as a prerequisite
  const dependentRows = await prisma.stageDependency.findMany({
    where: { dependsOnStageId: completedStageId },
    select: {
      stage: {
        select: {
          id: true,
          name: true,
          order: true,
          defaultTeamId: true,
          defaultTeam: { select: { name: true } },
        },
      },
    },
  });

  const activated: PreviewStage[] = [];
  const blocked: PreviewStage[] = [];

  for (const row of dependentRows) {
    const stage = row.stage;

    // Skip stages already active or completed (no-regress guard)
    const existing = await prisma.taskActiveStage.findUnique({
      where: { taskId_stageId: { taskId, stageId: stage.id } },
      select: { status: true },
    });
    if (existing?.status === "ACTIVE" || existing?.status === "COMPLETED") {
      continue;
    }

    // Check all OTHER prerequisites of this stage (excluding completedStageId,
    // which we are treating as "will be completed")
    const allPrereqs = await prisma.stageDependency.findMany({
      where: { stageId: stage.id },
      select: { dependsOnStageId: true },
    });
    const otherPrereqs = allPrereqs.filter((p) => p.dependsOnStageId !== completedStageId);

    let allOtherComplete = true;
    for (const prereq of otherPrereqs) {
      const done = await prisma.taskActiveStage.findFirst({
        where: { taskId, stageId: prereq.dependsOnStageId, status: "COMPLETED" },
        select: { id: true },
      });
      if (!done) {
        allOtherComplete = false;
        break;
      }
    }

    // Skip already-blocked stages that remain partially unmet (no-op, matches
    // the behaviour in activateNextStages)
    if (existing?.status === "BLOCKED" && !allOtherComplete) {
      continue;
    }

    const preview: PreviewStage = {
      id: stage.id,
      name: stage.name,
      order: stage.order,
      defaultTeamId: stage.defaultTeamId,
      defaultTeam: stage.defaultTeam,
    };

    if (allOtherComplete) {
      activated.push(preview);
    } else {
      blocked.push(preview);
    }
  }

  return { activated, blocked };
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
