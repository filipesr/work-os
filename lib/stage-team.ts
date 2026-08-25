import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

/**
 * Time EFETIVO de uma etapa de tarefa.
 *
 * Uma etapa de template sem `defaultTeamId` é flexível por desenho: o template
 * afirma que o passo existe ("Apoio", "Revisão extra"), não quem o executa. Quem
 * executa é decidido na criação da demanda e fica em `TaskActiveStage.teamId`.
 *
 * A regra é uma só — **override da tarefa, senão o padrão do template** — e vive
 * aqui porque estava prestes a ser reescrita em cada consulta de fila, cockpit e
 * relatório. Regra repetida é regra que diverge: bastaria uma tela esquecer o
 * override para a mesma etapa aparecer em dois times diferentes conforme a tela.
 */

/** Formato mínimo que qualquer consulta precisa trazer para resolver o time. */
export type StageTeamRow = {
  teamId?: string | null;
  team?: { id: string; name: string } | null;
  stage?: { defaultTeam?: { id: string; name: string } | null } | null;
};

/** `include` a acoplar em consultas que partem de `TaskActiveStage` e precisam
 *  exibir/agrupar por time. Sem ele o override é invisível para o resolvedor. */
export const stageTeamInclude = {
  team: { select: { id: true, name: true } },
} as const;

/** O time efetivo, ou null quando a etapa segue sem roteamento (coringa que
 *  ninguém direcionou — caso legítimo, e que precisa aparecer como tal). */
export function effectiveStageTeam(row: StageTeamRow): { id: string; name: string } | null {
  if (row.team) return row.team;
  return row.stage?.defaultTeam ?? null;
}

/** Só o id — atalho para os agrupamentos que não exibem o nome. */
export function effectiveStageTeamId(row: StageTeamRow): string | null {
  return effectiveStageTeam(row)?.id ?? null;
}

/**
 * Fragmento de `where` (enraizado em `TaskActiveStage`) para "etapas cujo time
 * efetivo está entre `teamIds`".
 *
 * O `teamId: null` no segundo ramo é o que impede a dupla contagem: uma etapa
 * roteada para o time A **não** pode continuar aparecendo para o time padrão B
 * do template — o roteamento explícito substitui o padrão, não soma a ele.
 *
 * Devolve um objeto com `OR`; ao combinar com outros filtros que também usem
 * `OR` no mesmo nível, coloque este fragmento dentro de `AND: [...]`.
 */
export function stageTeamWhere(teamIds: string | string[]): Prisma.TaskActiveStageWhereInput {
  const ids = Array.isArray(teamIds) ? teamIds : [teamIds];
  return {
    OR: [{ teamId: { in: ids } }, { teamId: null, stage: { defaultTeamId: { in: ids } } }],
  };
}

/**
 * Termos de `where` que capturam as etapas CORINGA roteadas para `teamIds`, para
 * as tabelas HISTÓRICAS — log de etapa, apontamento de horas, transição,
 * retrabalho. Elas guardam o par `(taskId, stageId)` mas não o roteamento, que
 * vive em `TaskActiveStage`; sem estes termos o trabalho de uma etapa coringa
 * simplesmente sumiria dos relatórios por time (hoje ele some).
 *
 * Agrupa por `stageId` de propósito: o número de termos passa a ser o de etapas
 * coringa distintas roteadas para o time — um punhado — em vez de um termo por
 * demanda. É exato: cada par roteado aparece uma vez e só uma.
 *
 * Devolve `[]` quando o time nunca recebeu etapa coringa, que é o caso normal.
 */
export async function routedStageTerms(
  teamIds: string | string[]
): Promise<{ stageId: string; taskId: { in: string[] } }[]> {
  const ids = Array.isArray(teamIds) ? teamIds : [teamIds];
  const rows = await prisma.taskActiveStage.findMany({
    where: { teamId: { in: ids } },
    select: { taskId: true, stageId: true },
  });
  const byStage = new Map<string, string[]>();
  for (const row of rows) {
    const list = byStage.get(row.stageId);
    if (list) list.push(row.taskId);
    else byStage.set(row.stageId, [row.taskId]);
  }
  return [...byStage].map(([stageId, taskIds]) => ({ stageId, taskId: { in: taskIds } }));
}

/**
 * Mapa `"taskId:stageId" → teamId` de todas as etapas coringa roteadas.
 *
 * Para agregações que percorrem linhas históricas em memória (log de etapa,
 * transição) e precisam do time linha a linha, onde um `where` não resolve. Só
 * carrega as linhas COM roteamento — o overhead é proporcional ao uso de etapa
 * coringa, não ao tamanho do histórico.
 */
export async function routedTeamByPair(): Promise<Map<string, string>> {
  const rows = await prisma.taskActiveStage.findMany({
    where: { teamId: { not: null } },
    select: { taskId: true, stageId: true, teamId: true },
  });
  return new Map(rows.map((r) => [`${r.taskId}:${r.stageId}`, r.teamId as string]));
}
