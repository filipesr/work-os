"use server";

import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";

export type StageView = {
  stage: {
    activeStageId: string;
    name: string;
    order: number;
    status: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED";
    teamName: string | null;
    assignee: { id: string; name: string } | null;
    instruction: string | null;
  };
  task: {
    id: string;
    title: string;
    dueDate: Date | null;
    projectName: string;
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
};

/** Recebe a demanda da URL junto: o id da etapa existir não basta — ver o guarda na Task 7. */
export async function getStageView(
  activeStageId: string,
  taskId: string
): Promise<StageView | null> {
  // Mesma porta de /tasks/{id}: a tela da etapa não afrouxa quem enxerga o quê.
  await getSessionUser();

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: {
      id: true,
      status: true,
      instructions: true,
      taskId: true,
      stage: { select: { name: true, order: true } },
      team: { select: { name: true } },
      assignee: { select: { id: true, name: true, email: true } },
      task: {
        select: {
          id: true,
          title: true,
          dueDate: true,
          project: { select: { name: true, client: { select: { name: true } } } },
        },
      },
    },
  });
  if (!row || row.taskId !== taskId) return null;

  // A conversa INTEIRA da demanda: a etapa é uma lente sobre ela, não um recorte. Filtrar aqui
  // tiraria de quem opera o contexto do que já foi dito nas etapas anteriores.
  const comments = await prisma.taskComment.findMany({
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

  // `name ?? email ?? id` é a convenção do projeto — conta sem nome não pode virar um cuid na tela.
  const nomeDe = (u: { id: string; name: string | null; email: string | null }) =>
    u.name ?? u.email ?? u.id;

  return {
    stage: {
      activeStageId: row.id,
      name: row.stage.name,
      order: row.stage.order,
      status: row.status,
      teamName: row.team?.name ?? null,
      assignee: row.assignee ? { id: row.assignee.id, name: nomeDe(row.assignee) } : null,
      instruction: row.instructions,
    },
    task: {
      id: row.task.id,
      title: row.task.title,
      dueDate: row.task.dueDate,
      projectName: row.task.project.name,
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
  };
}
