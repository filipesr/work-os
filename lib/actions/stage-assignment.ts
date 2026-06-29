"use server";

import prisma from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";
import { areAllPrerequisitesComplete } from "@/lib/stage-assignment-helpers";

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
  const candidateStages = dependentRows.map((r) => r.stage);
  const candidateIds = candidateStages.map((s) => s.id);

  // Bulk-load everything the loop needs in three queries instead of O(stages ×
  // prerequisites) point reads (the previous N+1).
  const [existingRows, prereqRows, completedRows] = await Promise.all([
    prisma.taskActiveStage.findMany({
      where: { taskId, stageId: { in: candidateIds } },
      select: { stageId: true, status: true, assigneeId: true },
    }),
    prisma.stageDependency.findMany({
      where: { stageId: { in: candidateIds } },
      select: { stageId: true, dependsOnStageId: true },
    }),
    prisma.taskActiveStage.findMany({
      where: { taskId, status: "COMPLETED" },
      select: { stageId: true },
    }),
  ]);

  const existingByStage = new Map(existingRows.map((e) => [e.stageId, e]));
  const prereqsByStage = new Map<string, string[]>();
  for (const p of prereqRows) {
    const arr = prereqsByStage.get(p.stageId);
    if (arr) arr.push(p.dependsOnStageId);
    else prereqsByStage.set(p.stageId, [p.dependsOnStageId]);
  }
  // Treat completedStageId as completed ("will be completed" on confirm).
  const completedSet = new Set(completedRows.map((c) => c.stageId));
  completedSet.add(completedStageId);

  const activated: PreviewStage[] = [];
  const blocked: PreviewStage[] = [];

  for (const stage of candidateStages) {
    const existing = existingByStage.get(stage.id);

    // Skip stages already active or completed (no-regress guard)
    if (existing?.status === "ACTIVE" || existing?.status === "COMPLETED") {
      continue;
    }

    const prereqs = prereqsByStage.get(stage.id) ?? [];
    const allOtherComplete = areAllPrerequisitesComplete(prereqs, completedSet);

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
