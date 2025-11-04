"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";

// ========== StageDependency Actions ==========

/**
 * Updates the dependencies for a stage.
 * Performs a diff: creates new dependencies, deletes removed ones.
 */
export async function updateStageDependencies(
  stageId: string,
  templateId: string,
  newDependsOnStageIds: string[]
) {
  await requireAdmin();

  try {
    // Get current dependencies
    const currentDependencies = await prisma.stageDependency.findMany({
      where: { stageId },
      select: { dependsOnStageId: true },
    });

    const currentDependencyIds = currentDependencies.map(
      (d: { dependsOnStageId: string }) => d.dependsOnStageId
    );

    // Calculate what to add and what to remove
    const toAdd = newDependsOnStageIds.filter(
      (id: string) => !currentDependencyIds.includes(id)
    );
    const toRemove = currentDependencyIds.filter(
      (id: string) => !newDependsOnStageIds.includes(id)
    );

    // Perform the diff operations
    await prisma.$transaction([
      // Delete removed dependencies
      prisma.stageDependency.deleteMany({
        where: {
          stageId,
          dependsOnStageId: { in: toRemove },
        },
      }),
      // Create new dependencies
      ...toAdd.map((dependsOnStageId) =>
        prisma.stageDependency.create({
          data: {
            stageId,
            dependsOnStageId,
          },
        })
      ),
    ]);

    revalidatePath(`/admin/templates/${templateId}`);
    return { success: true };
  } catch (error) {
    console.error("Error updating stage dependencies:", error);
    return { error: "Failed to update dependencies" };
  }
}

/**
 * Get all possible dependency stages for a given stage
 * (excludes the stage itself)
 */
export async function getAvailableDependencyStages(
  stageId: string,
  templateId: string
) {
  await requireAdmin();

  return prisma.templateStage.findMany({
    where: {
      templateId,
      id: { not: stageId },
    },
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      order: true,
    },
  });
}

/**
 * Get current dependencies for a stage
 */
export async function getCurrentDependencies(stageId: string) {
  await requireAdmin();

  const dependencies = await prisma.stageDependency.findMany({
    where: { stageId },
    select: { dependsOnStageId: true },
  });

  return dependencies.map((d: { dependsOnStageId: string }) => d.dependsOnStageId);
}
