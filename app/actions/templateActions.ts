"use server";

import { prisma } from "@/lib/prisma";

/**
 * Fetches all workflow templates with their stage count.
 * Used for the template dropdown in the Create Task form.
 */
export async function getTemplateListWithCount() {
  return prisma.workflowTemplate.findMany({
    select: {
      id: true,
      name: true,
      _count: {
        select: { stages: true },
      },
    },
    orderBy: { name: 'asc' },
  });
}

/**
 * Fetches the actual stages for a single selected template.
 * Used for the stage preview in the Create Task form.
 */
export async function getTemplateStagePreview(templateId: string) {
  if (!templateId) return [];

  return prisma.templateStage.findMany({
    where: { templateId: templateId },
    select: {
      id: true,
      name: true,
      order: true,
    },
    orderBy: { order: 'asc' },
  });
}
