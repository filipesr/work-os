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

/**
 * Referência de várias etapas de uma vez. Uma consulta para todas, e não uma por etapa: a mesa
 * semanal mostra dezenas de itens, e o N+1 aqui apareceria como tela lenta sem causa óbvia.
 */
export async function getStageReferences(stageIds: string[]): Promise<Map<string, StageReference>> {
  const out = new Map<string, StageReference>();
  if (stageIds.length === 0) return out;

  const [stages, logs] = await Promise.all([
    prisma.templateStage.findMany({
      where: { id: { in: stageIds } },
      select: { id: true, expectedDurationHours: true },
    }),
    // Só log FECHADO tem duração. `status: COMPLETED` exclui as reversões, que medem uma tentativa
    // interrompida e não o tempo típico da etapa.
    prisma.taskStageLog.findMany({
      where: { stageId: { in: stageIds }, exitedAt: { not: null }, status: "COMPLETED" },
      select: { stageId: true, enteredAt: true, exitedAt: true },
    }),
  ]);

  const porEtapa = new Map<string, number[]>();
  for (const log of logs) {
    if (!log.exitedAt) continue;
    const horas = (log.exitedAt.getTime() - log.enteredAt.getTime()) / 3.6e6;
    const lista = porEtapa.get(log.stageId);
    if (lista) lista.push(horas);
    else porEtapa.set(log.stageId, [horas]);
  }

  for (const stage of stages) {
    out.set(
      stage.id,
      resolveStageReference(porEtapa.get(stage.id) ?? [], stage.expectedDurationHours)
    );
  }
  return out;
}
