"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { templateStageSchema } from "@/lib/validations";
import { canAddStage, canDeleteStage } from "@/lib/template-invariants";

export async function createTemplateStage(templateId: string, formData: FormData) {
  await requireAdmin();

  const parsed = templateStageSchema.safeParse({
    name: formData.get("name") ?? "",
    order: formData.get("order") ?? undefined,
    defaultTeamId: (formData.get("defaultTeamId") as string) || undefined,
    expectedDurationHours: formData.get("expectedDurationHours") ?? undefined,
    wipLimit: formData.get("wipLimit") ?? undefined,
    optional: formData.get("optional") ?? undefined,
    dependencies: formData.getAll("dependencies[]"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Um fluxo rápido tem etapa única. A tela já desabilita o botão; aqui é a garantia, porque
  // requisição fora da tela não passa pela tela.
  const [template, stageCount] = await Promise.all([
    prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      select: { quickEntry: true },
    }),
    prisma.templateStage.count({ where: { templateId } }),
  ]);
  if (!canAddStage({ stageCount, quickEntry: template?.quickEntry ?? false })) {
    return { error: (await getTranslations("errors.template"))("quickCannotAddStage") };
  }

  const { name, order, defaultTeamId, expectedDurationHours, wipLimit, optional, dependencies } =
    parsed.data;

  try {
    const newStage = await prisma.templateStage.create({
      data: {
        name,
        order,
        templateId,
        defaultTeamId: defaultTeamId || null,
        expectedDurationHours: expectedDurationHours ?? null,
        wipLimit: wipLimit ?? null,
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
    return { error: (await getTranslations("errors.stage"))("createFailed") };
  }
}

export async function updateTemplateStage(stageId: string, templateId: string, formData: FormData) {
  await requireAdmin();

  const parsed = templateStageSchema.safeParse({
    name: formData.get("name") ?? "",
    order: formData.get("order") ?? undefined,
    defaultTeamId: (formData.get("defaultTeamId") as string) || undefined,
    expectedDurationHours: formData.get("expectedDurationHours") ?? undefined,
    wipLimit: formData.get("wipLimit") ?? undefined,
    optional: formData.get("optional") ?? undefined,
    dependencies: formData.getAll("dependencies[]"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, order, defaultTeamId, expectedDurationHours, wipLimit, optional, dependencies } =
    parsed.data;

  try {
    await prisma.templateStage.update({
      where: { id: stageId },
      data: {
        name,
        order,
        defaultTeamId: defaultTeamId || null,
        expectedDurationHours: expectedDurationHours ?? null,
        wipLimit: wipLimit ?? null,
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
    return { error: (await getTranslations("errors.stage"))("updateFailed") };
  }
}

export async function deleteTemplateStage(stageId: string, templateId: string) {
  await requireAdmin();

  // Template sem etapa não deve existir: `createTaskStages` lança "Template is misconfigured" só
  // muito depois, quando alguém tenta criar uma demanda — longe de quem apagou.
  const stageCount = await prisma.templateStage.count({ where: { templateId } });
  if (!canDeleteStage(stageCount)) {
    return { error: (await getTranslations("errors.template"))("lastStageCannotBeDeleted") };
  }

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
    return { error: (await getTranslations("errors.stage"))("deleteFailed") };
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
