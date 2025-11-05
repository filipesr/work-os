"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";

// ========== TemplateStage Actions ==========

export async function createTemplateStage(
  templateId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = formData.get("name") as string;
  const order = parseInt(formData.get("order") as string);
  const defaultTeamId = formData.get("defaultTeamId") as string;
  const dependencies = formData.getAll("dependencies[]") as string[];

  console.log('[CREATE STAGE] Received data:', {
    name,
    order,
    defaultTeamId,
    dependencies,
    templateId
  });

  if (!name) {
    return { error: "Stage name is required" };
  }

  if (isNaN(order)) {
    return { error: "Valid order number is required" };
  }

  try {
    // Create the stage first
    const newStage = await prisma.templateStage.create({
      data: {
        name,
        order,
        templateId,
        defaultTeamId: defaultTeamId || null,
      },
    });

    console.log('[CREATE STAGE] Stage created:', newStage.id);

    // Create dependencies if any were selected
    if (dependencies && dependencies.length > 0) {
      const dependencyData = dependencies.map(depId => ({
        stageId: newStage.id,
        dependsOnStageId: depId,
      }));

      console.log('[CREATE STAGE] Creating dependencies:', dependencyData);

      await prisma.stageDependency.createMany({
        data: dependencyData,
      });

      console.log('[CREATE STAGE] Dependencies created successfully');
    } else {
      console.log('[CREATE STAGE] No dependencies to create');
    }

    revalidatePath(`/admin/templates/${templateId}`);
    return { success: true };
  } catch (error) {
    console.error("[CREATE STAGE] Error:", error);
    return { error: "Failed to create stage" };
  }
}

export async function updateTemplateStage(
  stageId: string,
  templateId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = formData.get("name") as string;
  const order = parseInt(formData.get("order") as string);
  const defaultTeamId = formData.get("defaultTeamId") as string;
  const dependencies = formData.getAll("dependencies[]") as string[];

  console.log('[UPDATE STAGE] Received data:', {
    stageId,
    name,
    order,
    defaultTeamId,
    dependencies,
    templateId
  });

  if (!name) {
    return { error: "Stage name is required" };
  }

  if (isNaN(order)) {
    return { error: "Valid order number is required" };
  }

  try {
    // Update the stage
    await prisma.templateStage.update({
      where: { id: stageId },
      data: {
        name,
        order,
        defaultTeamId: defaultTeamId || null,
      },
    });

    console.log('[UPDATE STAGE] Stage updated');

    // Update dependencies: delete old ones and create new ones
    const deletedCount = await prisma.stageDependency.deleteMany({
      where: { stageId: stageId },
    });

    console.log('[UPDATE STAGE] Deleted old dependencies:', deletedCount.count);

    if (dependencies && dependencies.length > 0) {
      const dependencyData = dependencies.map(depId => ({
        stageId: stageId,
        dependsOnStageId: depId,
      }));

      console.log('[UPDATE STAGE] Creating new dependencies:', dependencyData);

      await prisma.stageDependency.createMany({
        data: dependencyData,
      });

      console.log('[UPDATE STAGE] Dependencies created successfully');
    } else {
      console.log('[UPDATE STAGE] No dependencies to create');
    }

    revalidatePath(`/admin/templates/${templateId}`);
    return { success: true };
  } catch (error) {
    console.error("[UPDATE STAGE] Error:", error);
    return { error: "Failed to update stage" };
  }
}

export async function deleteTemplateStage(stageId: string, templateId: string) {
  await requireAdmin();

  try {
    // First, delete all dependencies that reference this stage
    await prisma.stageDependency.deleteMany({
      where: {
        OR: [{ stageId: stageId }, { dependsOnStageId: stageId }],
      },
    });

    // Then delete the stage
    await prisma.templateStage.delete({
      where: { id: stageId },
    });

    revalidatePath(`/admin/templates/${templateId}`);
    return { success: true };
  } catch (error) {
    console.error("Error deleting stage:", error);
    return { error: "Failed to delete stage" };
  }
}

export async function getTeamsForSelect() {
  await requireAdmin();

  return prisma.team.findMany({
    select: {
      id: true,
      name: true,
    },
    orderBy: { name: "asc" },
  });
}
