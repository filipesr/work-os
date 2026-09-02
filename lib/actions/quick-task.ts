"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";
import {
  QUICK_TASK_MAX_BACKDATE_DAYS,
  quickTaskTimestamps,
  validateQuickTaskDate,
} from "@/lib/quick-task";

// `validateQuickTaskDate` compara `dateISO` lexicograficamente contra "hoje" — só funciona se
// vier em YYYY-MM-DD com zero à esquerda ("2026-8-5" quebraria a comparação em silêncio). Esta
// action é a única chamadora, então a garantia mora aqui: formato ruim vira erro próprio, nunca
// chega a `validateQuickTaskDate`.
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

/** Tipos disponíveis no formulário rápido: só fluxos marcados como tal. */
export async function getQuickTemplates(): Promise<{ id: string; name: string }[]> {
  await requireMemberOrHigher();
  return prisma.workflowTemplate.findMany({
    where: { quickEntry: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Registra um trabalho de etapa única que JÁ aconteceu.
 *
 * Não passa por `createTaskStages`: aquela função existe para ABRIR um fluxo (primeira etapa ACTIVE,
 * log aberto, validação de responsável contra o time). Aqui o fluxo já terminou — a etapa nasce
 * concluída e o responsável é quem registrou, por definição. Reusá-la exigiria desfazer o que faz.
 */
export async function createQuickTask(formData: FormData) {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;
  const t = await getTranslations("errors.quickTask");

  const templateId = String(formData.get("templateId") ?? "");
  const projectId = String(formData.get("projectId") ?? "");
  const date = String(formData.get("date") ?? "");
  const minutes = Number(formData.get("minutes") ?? 0);
  const link = String(formData.get("link") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();

  if (!templateId) return { error: t("templateRequired") };
  if (!projectId) return { error: t("projectRequired") };
  if (!Number.isFinite(minutes) || minutes <= 0) return { error: t("minutesInvalid") };

  if (!DATE_FORMAT.test(date)) return { error: t("dateInvalid") };

  const problema = validateQuickTaskDate(date);
  if (problema === "future") return { error: t("dateFuture") };
  if (problema === "tooOld") {
    return { error: t("dateTooOld", { days: QUICK_TASK_MAX_BACKDATE_DAYS }) };
  }

  const [template, project] = await Promise.all([
    prisma.workflowTemplate.findUnique({
      where: { id: templateId },
      select: { id: true, quickEntry: true, stages: { select: { id: true }, take: 2 } },
    }),
    prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }),
  ]);

  // A marca é o que separa a CLASSE. Sem esta guarda, um fluxo normal registrado por aqui nasceria
  // com lead time zero e envenenaria o p50/p85 do próprio tipo.
  if (!template || !template.quickEntry || template.stages.length !== 1) {
    return { error: t("templateNotQuick") };
  }
  if (!project) return { error: t("projectRequired") };

  const stageId = template.stages[0].id;
  const { createdAt, startedAt, completedAt } = quickTaskTimestamps(date, minutes);

  try {
    const taskId = await prisma.$transaction(async (dbtx: Prisma.TransactionClient) => {
      const task = await dbtx.task.create({
        data: {
          title: title || "Registro rápido",
          description: description || null,
          status: "COMPLETED",
          priority: "MEDIUM",
          projectId,
          workflowTemplateId: templateId,
          createdAt,
          startedAt,
          completedAt,
          // Etapa única já concluída baixa o risco de instrução sem dono, mas a demanda ainda
          // precisa nascer com autor — mesma promessa dos outros caminhos de criação.
          createdById: userId,
        },
        select: { id: true },
      });

      await dbtx.taskActiveStage.create({
        data: {
          taskId: task.id,
          stageId,
          status: "COMPLETED",
          assigneeId: userId,
          assignedAt: startedAt,
          activatedAt: startedAt,
          completedAt,
        },
      });

      // O log de etapa e as transições existem para o histórico de fluxo ficar reconstruível — os
      // relatórios de gargalo e de flow efficiency leem daqui, não da Task.
      await dbtx.taskStageLog.create({
        data: {
          taskId: task.id,
          stageId,
          userId,
          enteredAt: startedAt,
          exitedAt: completedAt,
          status: "COMPLETED",
        },
      });
      await dbtx.stageTransition.create({
        data: { taskId: task.id, stageId, status: "ACTIVE", at: startedAt },
      });
      await dbtx.stageTransition.create({
        data: { taskId: task.id, stageId, status: "COMPLETED", at: completedAt },
      });

      // Minutos viram horas: é assim que TimeLog guarda, e é o que a produtividade soma.
      await dbtx.timeLog.create({
        data: {
          taskId: task.id,
          stageId,
          userId,
          hoursSpent: minutes / 60,
          logDate: completedAt,
          description: description || null,
        },
      });

      if (link) {
        await dbtx.taskArtifact.create({
          data: {
            title: title || "Publicação",
            url: link,
            scope: "TASK",
            storageKind: "LINK",
            uploadStatus: "READY",
            // INTERNO, não CLIENTE: `lib/nas/sensitivity.ts` mostra que CLIENTE é o nível mais
            // PERMISSIVO — o único que libera download externo e link de compartilhamento público.
            // Quem lança aqui é MEMBER, e `changeSensitivity` reserva escolher esse nível a
            // MANAGER+; gravar CLIENTE por padrão deixaria um MEMBER conceder, sem querer, o que a
            // action de mudança de sensibilidade existe para vedar. INTERNO cumpre o que a spec
            // pede ("nunca CONFIDENCIAL") sem abrir esse canal.
            sensitivity: "INTERNO",
            taskId: task.id,
            userId,
          },
        });
      }

      return task.id;
    });

    revalidatePath("/dashboard");
    revalidatePath("/admin/tasks");
    revalidatePath(`/projects/${projectId}`);
    return { success: true as const, taskId };
  } catch (error) {
    console.error("createQuickTask error:", error);
    return { error: t("createFailed") };
  }
}
