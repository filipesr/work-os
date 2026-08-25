"use server";

import prisma from "@/lib/prisma";
import { requireMemberOrHigher } from "@/lib/permissions";
import { computeStageReadiness } from "@/lib/stage-assignment-helpers";

// Client-callable Server Actions only. Pure/server-only helpers
// (isValidStageAssignee, parseStageAssignments, createTaskStages) live in
// lib/stage-assignment-helpers.ts — a "use server" module may only export
// async functions.

export type PreviewStage = {
  id: string;
  name: string;
  order: number;
  /** Time EFETIVO da etapa: o roteado na criação (coringa) ou o padrão do
   *  template. Null = etapa coringa que ninguém direcionou ainda. */
  teamId: string | null;
  team: { name: string } | null;
  /** Responsible already assigned to this (pre-created) stage, if any. */
  assigneeId: string | null;
  /** O que precisa ser feito nesta etapa coringa, escrito na criação. */
  instructions: string | null;
};

/**
 * Read-only preview of which stages will be activated or blocked when
 * `completedStageId` is completed. Does NOT mutate anything.
 * Used by the advance-stage modal to show next stages before confirmation.
 *
 * Roda o MESMO motor da ativação real (`computeStageReadiness`) sobre o grafo
 * inteiro do template, e não apenas sobre quem depende diretamente da etapa
 * concluída. A diferença aparece exatamente no caso que motivou isto: uma etapa
 * opcional no meio do fluxo, deixada de fora na criação. A versão antiga
 * anunciava a própria etapa excluída como "próxima" — ela é quem depende da
 * concluída — e escondia a etapa seguinte, que é a que de fato abre, porque um
 * pré-requisito SEM LINHA nesta tarefa conta como satisfeito. Preview e
 * execução divergirem é pior do que não ter preview: o gestor confirma uma coisa
 * e o sistema faz outra.
 */
export async function previewNextStages(
  taskId: string,
  completedStageId: string
): Promise<{ activated: PreviewStage[]; blocked: PreviewStage[] }> {
  await requireMemberOrHigher();

  const anchor = await prisma.templateStage.findUnique({
    where: { id: completedStageId },
    select: { templateId: true },
  });
  if (!anchor) return { activated: [], blocked: [] };

  const [templateStages, rows] = await Promise.all([
    prisma.templateStage.findMany({
      where: { templateId: anchor.templateId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        order: true,
        defaultTeamId: true,
        defaultTeam: { select: { id: true, name: true } },
        dependencies: { select: { dependsOnStageId: true } },
      },
    }),
    // As linhas da tarefa são a lista de etapas INCLUÍDAS: etapa de template sem
    // linha aqui ficou de fora na criação.
    prisma.taskActiveStage.findMany({
      where: { taskId },
      select: {
        stageId: true,
        status: true,
        assigneeId: true,
        instructions: true,
        teamId: true,
        team: { select: { id: true, name: true } },
      },
    }),
  ]);

  const rowByStage = new Map(rows.map((r) => [r.stageId, r]));
  const includedStageIds = new Set(rows.map((r) => r.stageId));
  const completedStageIds = new Set(
    rows.filter((r) => r.status === "COMPLETED").map((r) => r.stageId)
  );
  // "Será concluída" ao confirmar — é o que o preview está antecipando.
  completedStageIds.add(completedStageId);
  const statusByStage = new Map(rows.map((r) => [r.stageId, r.status]));
  statusByStage.set(completedStageId, "COMPLETED");

  const transitions = computeStageReadiness({
    stages: templateStages.map((st) => ({
      id: st.id,
      dependsOnIds: st.dependencies.map((d) => d.dependsOnStageId),
    })),
    includedStageIds,
    completedStageIds,
    statusByStage,
  });

  const stageById = new Map(templateStages.map((st) => [st.id, st]));
  const activated: PreviewStage[] = [];
  const blocked: PreviewStage[] = [];

  for (const [stageId, next] of transitions) {
    if (statusByStage.get(stageId) === next) continue; // no-op: espelha activateNextStages
    const stage = stageById.get(stageId);
    if (!stage) continue;
    const row = rowByStage.get(stageId);
    const team = row?.team ?? stage.defaultTeam ?? null;
    const preview: PreviewStage = {
      id: stage.id,
      name: stage.name,
      order: stage.order,
      teamId: team?.id ?? null,
      team: team ? { name: team.name } : null,
      assigneeId: row?.assigneeId ?? null,
      instructions: row?.instructions ?? null,
    };
    if (next === "ACTIVE") activated.push(preview);
    else blocked.push(preview);
  }

  const byOrder = (a: PreviewStage, b: PreviewStage) => a.order - b.order;
  return { activated: activated.sort(byOrder), blocked: blocked.sort(byOrder) };
}

/** Members of a team, for the per-stage assignee selector. */
export async function getTeamMembers(
  teamId: string
): Promise<{ id: string; name: string | null; email: string | null }[]> {
  await requireMemberOrHigher();
  if (!teamId) return [];
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      members: { select: { id: true, name: true, email: true }, orderBy: { name: "asc" } },
    },
  });
  return team?.members ?? [];
}
