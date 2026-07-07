"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { templateStageSchema } from "@/lib/validations";

export async function createTemplateStage(templateId: string, formData: FormData) {
  await requireAdmin();

  const parsed = templateStageSchema.safeParse({
    name: formData.get("name") ?? "",
    order: formData.get("order") ?? undefined,
    defaultTeamId: (formData.get("defaultTeamId") as string) || undefined,
    expectedDurationHours: formData.get("expectedDurationHours") ?? undefined,
    optional: formData.get("optional") ?? undefined,
    dependencies: formData.getAll("dependencies[]"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, order, defaultTeamId, expectedDurationHours, optional, dependencies } = parsed.data;

  try {
    const newStage = await prisma.templateStage.create({
      data: {
        name,
        order,
        templateId,
        defaultTeamId: defaultTeamId || null,
        expectedDurationHours: expectedDurationHours ?? null,
        optional,
      },
    });

    if (dependencies && dependencies.length > 0) {
      const dependencyData = dependencies.map((depId) => ({
        stageId: newStage.id,
        dependsOnStageId: depId,
      }));

      await prisma.stageDependency.createMany({
        data: dependencyData,
      });
    }

    revalidatePath(`/admin/templates/${templateId}`);
    return { success: true };
  } catch (error) {
    logger.error("[CREATE STAGE] Error:", error);
    return { error: "Failed to create stage" };
  }
}

export async function updateTemplateStage(stageId: string, templateId: string, formData: FormData) {
  await requireAdmin();

  const parsed = templateStageSchema.safeParse({
    name: formData.get("name") ?? "",
    order: formData.get("order") ?? undefined,
    defaultTeamId: (formData.get("defaultTeamId") as string) || undefined,
    expectedDurationHours: formData.get("expectedDurationHours") ?? undefined,
    optional: formData.get("optional") ?? undefined,
    dependencies: formData.getAll("dependencies[]"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, order, defaultTeamId, expectedDurationHours, optional, dependencies } = parsed.data;

  try {
    await prisma.templateStage.update({
      where: { id: stageId },
      data: {
        name,
        order,
        defaultTeamId: defaultTeamId || null,
        expectedDurationHours: expectedDurationHours ?? null,
        optional,
      },
    });

    await prisma.stageDependency.deleteMany({
      where: { stageId: stageId },
    });

    if (dependencies && dependencies.length > 0) {
      const dependencyData = dependencies.map((depId) => ({
        stageId: stageId,
        dependsOnStageId: depId,
      }));

      await prisma.stageDependency.createMany({
        data: dependencyData,
      });
    }

    revalidatePath(`/admin/templates/${templateId}`);
    return { success: true };
  } catch (error) {
    logger.error("[UPDATE STAGE] Error:", error);
    return { error: "Failed to update stage" };
  }
}

export async function deleteTemplateStage(stageId: string, templateId: string) {
  await requireAdmin();

  try {
    await prisma.stageDependency.deleteMany({
      where: {
        OR: [{ stageId: stageId }, { dependsOnStageId: stageId }],
      },
    });

    await prisma.templateStage.delete({
      where: { id: stageId },
    });

    revalidatePath(`/admin/templates/${templateId}`);
    return { success: true };
  } catch (error) {
    logger.error("Error deleting stage:", error);
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
