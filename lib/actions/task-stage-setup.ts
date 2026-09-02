"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireManagerOrAdmin } from "@/lib/permissions";
import {
  parseSelectedStages,
  parseStageAssignments,
  parseStageTeams,
  parseStageInstructions,
} from "@/lib/stage-assignment-helpers";
import { recordStageTransition } from "@/lib/stage-transitions";
import { markTaskStarted } from "@/lib/task-start";
import { taskVirginBlocker } from "@/lib/task-virgin";
import { stagePath } from "@/lib/navigation";

/**
 * Corrige o desenho de uma demanda **ainda não iniciada**: quais etapas
 * opcionais entram, para qual time vai cada etapa coringa, quem responde e com
 * que instrução.
 *
 * Só roda enquanto a tarefa é virgem (ver lib/task-virgin.ts). É a janela em que
 * a correção é livre — depois dela, mudar o time de uma etapa reescreveria
 * medição já produzida em vez de corrigir um erro de planejamento.
 *
 * Aceita FormData com exatamente os MESMOS campos do formulário de criação
 * (`stage:`, `team:`, `assignee:`, `instructions:`), lidos pelos mesmos
 * parsers — as duas telas são a mesma decisão, tomada em momentos diferentes.
 */
export async function updateTaskStageSetup(formData: FormData) {
  // Decisão de processo (qual time faz o quê), não de execução — por isso
  // gestor/admin, e não qualquer membro que consiga criar demanda.
  const user = await requireManagerOrAdmin();
  const userId = user.id as string;
  const t = await getTranslations("errors.stageSetup");

  const taskId = String(formData.get("taskId") ?? "");
  if (!taskId) return { error: t("taskRequired") };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      projectId: true,
      workflowTemplateId: true,
      activeStages: { select: { stageId: true, status: true, assigneeId: true } },
    },
  });
  if (!task) return { error: t("taskNotFound") };
  if (!task.workflowTemplateId) return { error: t("noTemplate") };

  const blocker = taskVirginBlocker(task);
  if (blocker) return { error: t(`locked.${blocker}`) };

  const selected = parseSelectedStages(formData);
  const teams = parseStageTeams(formData);
  const assignments = parseStageAssignments(formData);
  const instructions = parseStageInstructions(formData);

  const stages = await prisma.templateStage.findMany({
    where: { templateId: task.workflowTemplateId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      optional: true,
      defaultTeamId: true,
      defaultTeam: { select: { members: { select: { id: true } } } },
    },
  });
  if (stages.length === 0) return { error: t("noStages") };

  // Etapa NÃO-opcional entra sempre: ela é o processo, e deixar a edição
  // removê-la transformaria a correção numa reescrita do fluxo. Só as opcionais
  // respondem ao checkbox.
  const included = stages.filter((s) => !s.optional || selected.has(s.id));
  if (included.length === 0) return { error: t("atLeastOneStage") };

  // Roteamento só vale onde o template não nomeou time (etapa coringa).
  const routable = new Map<string, string>();
  for (const stage of included) {
    const requested = teams[stage.id];
    if (requested && !stage.defaultTeamId) routable.set(stage.id, requested);
  }
  const membersByTeam = new Map<string, Set<string>>();
  if (routable.size > 0) {
    const rows = await prisma.team.findMany({
      where: { id: { in: [...new Set(routable.values())] } },
      select: { id: true, members: { select: { id: true } } },
    });
    for (const team of rows) membersByTeam.set(team.id, new Set(team.members.map((m) => m.id)));
  }

  const includedIds = new Set(included.map((s) => s.id));
  const existingByStage = new Map(task.activeStages.map((r) => [r.stageId, r]));
  const entryStageId = included[0].id; // menor ordem incluída = entrada do fluxo
  let entryAssigned = false;
  // Capturado dentro da transação (o próprio update/create da entrada já devolve a linha) e usado
  // só depois, fora dela, para revalidar a tela da etapa — sem consulta extra.
  let entryActiveStageId: string | null = null;

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1. Etapas que saíram do desenho. A tarefa nunca começou, então não há
    //    história a preservar: as linhas, as transições e o log de entrada
    //    descrevem algo que não aconteceu. Mantê-los deixaria a reconstrução do
    //    par (tarefa, etapa) falando de uma etapa que não faz parte da demanda.
    const removed = task.activeStages.filter((r) => !includedIds.has(r.stageId));
    if (removed.length > 0) {
      const removedIds = removed.map((r) => r.stageId);
      await tx.taskActiveStage.deleteMany({ where: { taskId, stageId: { in: removedIds } } });
      await tx.stageTransition.deleteMany({ where: { taskId, stageId: { in: removedIds } } });
      await tx.taskStageLog.deleteMany({ where: { taskId, stageId: { in: removedIds } } });
    }

    // 2. Etapas incluídas: cria as novas, atualiza as que já existiam.
    for (const stage of included) {
      const isEntry = stage.id === entryStageId;
      const status = isEntry ? "ACTIVE" : "INACTIVE";

      const requestedTeam = routable.get(stage.id);
      const teamId = requestedTeam && membersByTeam.has(requestedTeam) ? requestedTeam : null;

      const requested = assignments[stage.id];
      const allowed = teamId
        ? (membersByTeam.get(teamId) ?? new Set<string>())
        : new Set((stage.defaultTeam?.members ?? []).map((m) => m.id));
      const assigneeId = requested && allowed.has(requested) ? requested : null;
      if (isEntry && assigneeId) entryAssigned = true;

      // Instrução só faz sentido onde o template não diz o que fazer.
      const note = stage.defaultTeamId ? null : (instructions[stage.id] ?? null);

      const existing = existingByStage.get(stage.id);
      if (existing) {
        const linha = await tx.taskActiveStage.update({
          where: { taskId_stageId: { taskId, stageId: stage.id } },
          data: {
            status,
            teamId,
            instructions: note,
            assigneeId,
            assignedAt: assigneeId ? new Date() : null,
          },
        });
        if (isEntry) entryActiveStageId = linha.id;
        if (existing.status !== status) {
          await recordStageTransition(tx, taskId, stage.id, status);
        }
      } else {
        const linha = await tx.taskActiveStage.create({
          data: {
            taskId,
            stageId: stage.id,
            status,
            teamId,
            instructions: note,
            assigneeId,
            ...(assigneeId ? { assignedAt: new Date() } : {}),
          },
        });
        if (isEntry) entryActiveStageId = linha.id;
        await recordStageTransition(tx, taskId, stage.id, status);
      }
    }

    // 3. O log de entrada tem de apontar para a entrada ATUAL. Excluir a
    //    primeira etapa move a entrada para a seguinte, e o log antigo passaria
    //    a afirmar que a tarefa entrou numa etapa que ela nunca teve.
    await tx.taskStageLog.deleteMany({ where: { taskId, stageId: { not: entryStageId } } });
    const entryLog = await tx.taskStageLog.findFirst({ where: { taskId, stageId: entryStageId } });
    if (!entryLog) {
      await tx.taskStageLog.create({
        data: { taskId, stageId: entryStageId, enteredAt: new Date(), exitedAt: null, userId },
      });
    }

    // 4. Entrada já com responsável = a tarefa começou (mesma regra da criação:
    //    o fluxo de reivindicar, que promove BACKLOG→IN_PROGRESS, não roda
    //    quando a etapa já nasce com dono).
    if (entryAssigned) {
      await tx.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
      await markTaskStarted(tx, taskId);
    }
  });

  revalidatePath(`/admin/tasks/${taskId}`);
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/admin/tasks");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${task.projectId}`);
  // A entrada é a única etapa que já nasce ACTIVE deste redesenho — time, instrução e
  // responsável dela podem ter mudado, e é a tela que alguém pode estar olhando agora.
  if (entryActiveStageId) revalidatePath(stagePath(taskId, entryActiveStageId));

  return { success: true };
}
