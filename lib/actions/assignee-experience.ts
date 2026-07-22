"use server";
import prisma from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";

export const EXPERIENCE_THRESHOLD = 3; // < isso = "novo neste tipo"

export interface AssigneeTypeExperience {
  completed: number;
  experienced: boolean;
}

/** Experiência da pessoa NAQUELE tipo (template): nº de etapas concluídas.
 * Insumo de LARGURA DE BANDA de previsão (Flyvbjerg/P4) — NUNCA nota/ranking/
 * comparação, nunca armazenado. */
export async function getAssigneeTypeExperience(
  userId: string,
  templateId: string
): Promise<AssigneeTypeExperience> {
  await requireMemberOrHigher();
  if (!userId || !templateId) return { completed: 0, experienced: false };
  const completed = await prisma.taskActiveStage.count({
    where: { assigneeId: userId, status: "COMPLETED", stage: { templateId } },
  });
  return { completed, experienced: completed >= EXPERIENCE_THRESHOLD };
}
