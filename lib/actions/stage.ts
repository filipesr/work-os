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

  if (!name) {
    return { error: "Stage name is required" };
  }

  if (isNaN(order)) {
    return { error: "Valid order number is required" };
  }

  try {
    await prisma.templateStage.create({
      data: {
        name,
        order,
        templateId,
        defaultTeamId: defaultTeamId || null,
      },
    });

    revalidatePath(`/admin/templates/${templateId}`);
    return { success: true };
  } catch (error) {
    console.error("Error creating stage:", error);
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

  if (!name) {
    return { error: "Stage name is required" };
  }

  if (isNaN(order)) {
    return { error: "Valid order number is required" };
  }

  try {
    await prisma.templateStage.update({
      where: { id: stageId },
      data: {
        name,
        order,
        defaultTeamId: defaultTeamId || null,
      },
    });

    revalidatePath(`/admin/templates/${templateId}`);
    return { success: true };
  } catch (error) {
    console.error("Error updating stage:", error);
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
