import "server-only";

import prisma from "@/lib/prisma";
import { percentile } from "@/lib/stats";

/**
 * Quanto uma etapa costuma levar — o número que a pessoa usa para se organizar e o gestor para ver
 * espaço livre.
 *
 * Percentil e não média: a biblioteca de conhecimento lista média como anti-feature de duração
 * (P3, distribuição enviesada). Uma etapa que quase sempre leva 1h e uma vez levou 40h tem média de
 * 7h — que encheria a agenda de todo mundo com um número que quase nunca acontece.
 */

/** Abaixo disto, percentil é anedota e não referência: cai no valor declarado. */
export const MIN_REFERENCE_SAMPLES = 5;

export type StageReference = {
  hours: number;
  /** `observed` = medido; `declared` = o SLA que alguém cadastrou. A tela MOSTRA a diferença. */
  source: "observed" | "declared";
};

/** Puro, para o teste alcançar a regra sem banco. */
export function resolveStageReference(
  durationsHours: number[],
  declaredHours: number | null
): StageReference {
  if (durationsHours.length >= MIN_REFERENCE_SAMPLES) {
    return { hours: percentile(durationsHours, 0.5), source: "observed" };
  }
  return { hours: declaredHours ?? 0, source: "declared" };
}

/** Janela do observado. Duas razões, as duas necessárias: uma medição de dois anos atrás não
 *  descreve o trabalho de hoje (equipe, ferramenta e escopo mudaram), e sem recorte a consulta
 *  carregaria o histórico inteiro — custo que só cresce, e cresce em silêncio. */
export const REFERENCE_WINDOW_DAYS = 180;

/**
 * Referência de várias etapas de uma vez. Uma consulta para todas, e não uma por etapa: a mesa
 * semanal mostra dezenas de itens, e o N+1 aqui apareceria como tela lenta sem causa óbvia.
 *
 * O observado vem do `TimeLog`, e não do intervalo do `TaskStageLog`, porque as duas coisas são
 * unidades DIFERENTES: `exitedAt − enteredAt` é tempo de RELÓGIO — tem madrugada e fim de semana
 * dentro (etapa reivindicada sexta às 16h e concluída segunda às 10h = 66h) —, enquanto a tela
 * soma este número contra a régua de 8h do dia e as 45h da semana, que são horas de TRABALHO. O
 * `hoursSpent` do TimeLog é hora de trabalho de verdade, e é a mesma fonte que o relatório de
 * produtividade usa contra `weeklyCapacityHours`.
 */
export async function getStageReferences(stageIds: string[]): Promise<Map<string, StageReference>> {
  const out = new Map<string, StageReference>();
  if (stageIds.length === 0) return out;

  const desde = new Date(Date.now() - REFERENCE_WINDOW_DAYS * 86_400_000);

  const [stages, logs] = await Promise.all([
    prisma.templateStage.findMany({
      where: { id: { in: stageIds } },
      select: { id: true, expectedDurationHours: true },
    }),
    prisma.timeLog.findMany({
      where: { stageId: { in: stageIds }, logDate: { gte: desde } },
      select: { taskId: true, stageId: true, hoursSpent: true },
    }),
  ]);

  // Uma OCORRÊNCIA da etapa é o par (taskId, stageId): a etapa acontece uma vez por demanda, mas o
  // apontamento vem picado — dois dias, duas pessoas, três lançamentos. Sem somar por ocorrência
  // antes do percentil, cada amostra seria "quanto alguém lançou num dia" e não "quanto esta etapa
  // custou daquela vez", e o p50 desabaria para o tamanho do lançamento típico.
  const porEtapa = new Map<string, Map<string, number>>();
  for (const log of logs) {
    // `stageId` é anulável no TimeLog (a hora pode ser da demanda inteira). O `in` do where já
    // exclui os nulos; a guarda existe para o tipo.
    if (!log.stageId) continue;
    const ocorrencias = porEtapa.get(log.stageId) ?? new Map<string, number>();
    ocorrencias.set(log.taskId, (ocorrencias.get(log.taskId) ?? 0) + log.hoursSpent);
    porEtapa.set(log.stageId, ocorrencias);
  }

  for (const stage of stages) {
    const horas = [...(porEtapa.get(stage.id)?.values() ?? [])];
    out.set(stage.id, resolveStageReference(horas, stage.expectedDurationHours));
  }
  return out;
}
