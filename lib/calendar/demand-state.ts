import type { Tone } from "@/lib/status-tone";

/**
 * Estado de uma demanda em relação ao PLANO — não ao seu status interno.
 *
 * `Task.status` diz em que ponto do fluxo a demanda está; isto diz se ela está
 * onde deveria no calendário. São perguntas diferentes: uma demanda IN_PROGRESS
 * pode estar tranquila ou atrasada, e é a segunda leitura que a tela de cobertura
 * precisa dar.
 *
 * A ordem de precedência abaixo é a parte que erra fácil, porque uma demanda
 * casa com vários critérios ao mesmo tempo. Ela vai do fato consumado ao
 * prognóstico: o que já aconteceu manda sobre o que pode acontecer.
 */
export type DemandState =
  | "delivered" // concluída dentro do prazo
  | "deliveredLate" // concluída, mas depois do prazo
  | "late" // prazo passou e não concluiu
  | "atRisk" // deveria ter começado e não começou
  | "inProgress" // em execução, dentro do prazo
  | "planned"; // ainda não chegou a hora

export interface DemandDates {
  plannedStartAt: Date | null;
  dueDate: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export function demandState(d: DemandDates, now: Date = new Date()): DemandState {
  // 1. Concluída: fato consumado. Se entregou, entregou — não importa se
  //    começou tarde no meio do caminho.
  if (d.completedAt) {
    if (d.dueDate && d.completedAt.getTime() > d.dueDate.getTime()) return "deliveredLate";
    return "delivered";
  }

  // 2. Prazo estourado e nada entregue. Vem antes de qualquer leitura de
  //    execução: uma demanda atrasada que está sendo tocada continua atrasada, e
  //    mostrá-la como "em execução" esconderia o problema atrás do movimento.
  if (d.dueDate && now.getTime() > d.dueDate.getTime()) return "late";

  // 3. Em execução dentro do prazo.
  if (d.startedAt) return "inProgress";

  // 4. Prognóstico: passou do início planejado e ninguém pegou. É o único aviso
  //    que chega ANTES do estrago — o atraso ainda não existe, mas o tempo de
  //    execução que o plano reservou já está sendo consumido em fila.
  if (d.plannedStartAt && now.getTime() > d.plannedStartAt.getTime()) return "atRisk";

  return "planned";
}

/**
 * Tom visual de cada estado.
 *
 * `delivered` é SUCCESS de propósito: era o buraco que motivou tudo isto. A
 * demanda concluída antes do evento sumia da leitura como se fosse ausência,
 * quando é o desfecho desejado — o cliente está coberto justamente porque o
 * trabalho terminou antes da data.
 */
export const DEMAND_STATE_TONE: Record<DemandState, Tone> = {
  delivered: "success",
  deliveredLate: "warning",
  late: "danger",
  atRisk: "warning",
  inProgress: "info",
  planned: "neutral",
};

/** Estados que pedem ação do gestor — o que a tela precisa destacar. */
export function needsAttention(state: DemandState): boolean {
  return state === "late" || state === "atRisk";
}
