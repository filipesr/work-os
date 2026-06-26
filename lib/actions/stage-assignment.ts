"use server";

import prisma from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";

// Client-callable Server Actions only. Pure/server-only helpers
// (isValidStageAssignee, parseStageAssignments, createTaskStages) live in
// lib/stage-assignment-helpers.ts — a "use server" module may only export
// async functions.

export type PreviewStage = {
  id: string;
  name: string;
  order: number;
  defaultTeamId: string | null;
  defaultTeam: { name: string } | null;
  /** Responsible already assigned to this (pre-created) stage, if any. */
  assigneeId: string | null;
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
      select: { status: true, assigneeId: true },
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
      assigneeId: existing?.assigneeId ?? null,
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
