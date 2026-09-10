import type { CardMovement } from "./types";
import type { MapStagesContext, StageName } from "./map-stages";
import { mapListToStage } from "./map-stages";

/**
 * Um evento de retrabalho: quando uma demanda é devolvida de uma etapa de qualidade para
 * reedição. O retrabalho é atribuído à etapa que INJETOU o defeito (sourceStageName),
 * não à etapa que o encontrou.
 *
 * Usado por: importar-trello-atlantico (task-7-map-rework)
 */
export interface ReworkEvent {
  /** Momento da devolução (ISO 8601). */
  at: Date;
  /** Tipo de retrabalho: INTERNAL (antes do cliente) ou CLIENT (depois que saiu). */
  kind: "INTERNAL" | "CLIENT";
  /** Nome da etapa que INJETOU o defeito — deve bater com StageName. */
  sourceStageName: StageName;
  /** ID do Trello do responsável pela retrabalho (opcional). */
  byTrelloId?: string;
  /** Motivo da devolução ou contexto. */
  reason: string;
}

/**
 * Transforma as devoluções da revisão em eventos de retrabalho.
 *
 * Uma devolução é um movimento que sai de "REVISIÓN" (Quality Control) para outra etapa
 * (exceto "LIBERADO", que é aprovação normal). O retrabalho é atribuído à etapa de
 * destino, que é aquela que INJETOU o defeito — não à revisão que o encontrou.
 *
 * @param movements Movimentações registradas do card.
 * @param ctx Contexto com nomes de lista.
 * @returns Array de eventos de retrabalho INTERNAL.
 */
export function planRework(movements: CardMovement[], ctx: MapStagesContext): ReworkEvent[] {
  const result: ReworkEvent[] = [];

  for (const mov of movements) {
    // Só interessa movimentos que saem de "REVISIÓN"
    const fromStageInfo = mapListToStage(mov.fromListName);
    if (fromStageInfo?.stageName !== "Quality Control") continue;

    // Se vai para "Aprovação", é uma saída normal, não retrabalho
    const toStageInfo = mapListToStage(mov.toListName);
    if (toStageInfo?.stageName === "Aprovação") continue;

    // Se o destino não mapeia para etapa nenhuma, ignora
    if (!toStageInfo) continue;

    // É um retrabalho: a origem é a etapa de destino (que injetou o defeito)
    result.push({
      at: new Date(mov.at),
      kind: "INTERNAL",
      sourceStageName: toStageInfo.stageName,
      reason: "Devolução da revisão",
    });
  }

  return result;
}
