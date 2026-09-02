"use server";

import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";
import { getPreviousStages } from "@/lib/actions/task";
import { getCurrentActiveLog } from "@/lib/actions/activity";
import { mapArtifactRow, type UnifiedArtifactRow } from "@/lib/artifacts/unify";
import { UserRole } from "@prisma/client";

export type StageView = {
  stage: {
    activeStageId: string;
    /** TemplateStage.id — o que `completeStageAndAdvance`, `revertTaskStage`,
     *  `unassignActiveStage` e `ActivityLog.stageId` esperam como "stageId". Difere de
     *  `activeStageId` (a LINHA `TaskActiveStage` desta instância), que só o comentário usa. */
    templateStageId: string;
    name: string;
    order: number;
    status: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED";
    teamName: string | null;
    assignee: { id: string; name: string } | null;
    instruction: string | null;
    /** Responsável por ESTA etapa OU papel gerencial — mesma regra de /tasks/{id} (Task 9: as
     *  ações agora avaliam a etapa da tela, não "alguma etapa ativa da demanda"). */
    canPerformActions: boolean;
  };
  task: {
    id: string;
    title: string;
    dueDate: Date | null;
    projectId: string;
    projectName: string;
    clientId: string;
    clientName: string;
  };
  /** A conversa INTEIRA da demanda: a etapa é uma lente sobre ela, não um recorte. */
  comments: {
    id: string;
    content: string;
    createdAt: Date;
    kind: "USER" | "STAGE_INSTRUCTION";
    activeStageId: string | null;
    author: { id: string; name: string };
  }[];
  /** Alvos válidos de reversão. É TASK-level, não desta etapa: o guard de `revertTaskStage`
   *  compara o alvo contra o menor `order` entre TODAS as etapas ativas da demanda (fork/join),
   *  não só a desta tela. */
  previousStages: { id: string; name: string; order: number }[];
  /** Cronômetro de QUEM VÊ a tela — pode estar rodando em OUTRA tarefa/etapa. É o que
   *  `ActivityButton` usa para decidir o aviso de troca. */
  activeLog: { id: string; taskId: string; task: { id: string; title: string } } | null;
  /** Artefatos da tarefa + projeto + cliente. O painel de artefatos passa a operar A PARTIR DA
   *  ETAPA (Task 9) — a demanda mantém o mesmo painel, mas só em leitura. */
  artifactRows: UnifiedArtifactRow[];
  /** MANAGER+ pode remover artefato — mesma regra do painel na demanda (papel, não etapa). */
  canManageScoped: boolean;
};

const MANAGERIAL_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR];

/** Recebe a demanda da URL junto: o id da etapa existir não basta — ver o guarda na Task 7. */
export async function getStageView(
  activeStageId: string,
  taskId: string
): Promise<StageView | null> {
  // Mesma porta de /tasks/{id}: a tela da etapa não afrouxa quem enxerga o quê.
  const user = await getSessionUser();

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: {
      id: true,
      status: true,
      instructions: true,
      taskId: true,
      stageId: true,
      stage: { select: { name: true, order: true } },
      team: { select: { name: true } },
      assignee: { select: { id: true, name: true, email: true } },
      task: {
        select: {
          id: true,
          title: true,
          dueDate: true,
          projectId: true,
          project: {
            select: {
              name: true,
              clientId: true,
              client: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!row || row.taskId !== taskId) return null;

  // A conversa INTEIRA da demanda: a etapa é uma lente sobre ela, não um recorte. Filtrar aqui
  // tiraria de quem opera o contexto do que já foi dito nas etapas anteriores.
  const commentsQuery = prisma.taskComment.findMany({
    where: { taskId: row.taskId },
    select: {
      id: true,
      content: true,
      createdAt: true,
      kind: true,
      activeStageId: true,
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Artefatos da tarefa + projeto + cliente numa única busca: os três dividem o mesmo modelo,
  // distinguidos por `scope` (ver `lib/artifacts/unify.ts`).
  const artifactsQuery = prisma.taskArtifact.findMany({
    where: {
      isCurrent: true,
      OR: [
        { taskId: row.taskId, scope: "TASK" },
        { projectId: row.task.projectId, scope: "PROJECT" },
        { clientId: row.task.project.clientId, scope: "CLIENT" },
      ],
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const [comments, artifacts, previousStages, activeLog] = await Promise.all([
    commentsQuery,
    artifactsQuery,
    // Task-level (não desta etapa) — ver comentário no tipo `previousStages` acima.
    getPreviousStages(row.taskId),
    getCurrentActiveLog(user.id),
  ]);

  // `name ?? email ?? id` é a convenção do projeto — conta sem nome não pode virar um cuid na tela.
  const nomeDe = (u: { id: string; name: string | null; email: string | null }) =>
    u.name ?? u.email ?? u.id;

  const isManagerialRole = MANAGERIAL_ROLES.includes(user.role);
  const isStageAssignee = row.assignee?.id === user.id;
  // MANAGER+ (não SUPERVISOR) pode remover artefato — mesma regra do painel na demanda.
  const canManageScoped = user.role === UserRole.ADMIN || user.role === UserRole.MANAGER;

  return {
    stage: {
      activeStageId: row.id,
      templateStageId: row.stageId,
      name: row.stage.name,
      order: row.stage.order,
      status: row.status,
      teamName: row.team?.name ?? null,
      assignee: row.assignee ? { id: row.assignee.id, name: nomeDe(row.assignee) } : null,
      instruction: row.instructions,
      canPerformActions: isStageAssignee || isManagerialRole,
    },
    task: {
      id: row.task.id,
      title: row.task.title,
      dueDate: row.task.dueDate,
      projectId: row.task.projectId,
      projectName: row.task.project.name,
      clientId: row.task.project.clientId,
      clientName: row.task.project.client.name,
    },
    comments: comments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      kind: c.kind,
      activeStageId: c.activeStageId,
      author: { id: c.user.id, name: nomeDe(c.user) },
    })),
    previousStages: previousStages.map((s) => ({ id: s.id, name: s.name, order: s.order })),
    activeLog: activeLog
      ? {
          id: activeLog.id,
          taskId: activeLog.taskId,
          task: { id: activeLog.task.id, title: activeLog.task.title },
        }
      : null,
    artifactRows: artifacts.map((a) =>
      mapArtifactRow(
        a,
        a.scope as UnifiedArtifactRow["origin"],
        a.scope === "TASK" ? { id: row.task.id, title: row.task.title } : null
      )
    ),
    canManageScoped,
  };
}
