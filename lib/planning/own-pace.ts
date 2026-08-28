import { percentile } from "@/lib/stats";

/**
 * A pessoa está acima do PRÓPRIO ritmo?
 *
 * Esta é a exceção deliberada da fatia 2 (ver a spec): a tela reconhece quem está rendendo mais que
 * de costume, para empurrar a fechar a semana. O que a separa de um placar são quatro escolhas, e
 * três delas moram aqui:
 *
 *   1. A comparação é com o histórico DELA, nunca com colegas. Se alguém está acima da média da
 *      equipe, alguém está abaixo, e a tela saberia quem.
 *   2. Mediana, não média: contagem semanal é distribuição enviesada (P3) — uma semana de férias ou
 *      de gravação puxaria a média e o reconhecimento sumiria por meses.
 *   3. Só existe no lado positivo. Não há versão inversa nem tom neutro de "abaixo do seu ritmo":
 *      quem está numa semana difícil não vê mensagem, e portanto não vê cobrança.
 *
 * A quarta trava está em quem chama: o número não é persistido em lugar nenhum.
 *
 * A unidade é CONTAGEM DE ETAPAS, não horas. Hora não é fungível (P7), e somar horas para elogiar
 * premiaria quem apontou mais tempo — exatamente o incentivo errado.
 */

/** Quantas semanas anteriores entram na conta. */
export const PACE_HISTORY_WEEKS = 8;

/** Abaixo disto não há amostra: um elogio calculado sobre duas semanas é ruído com cara de mérito. */
export const PACE_MIN_WEEKS = 4;

export function isAboveOwnPace(thisWeek: number, previousWeeks: number[]): boolean {
  if (previousWeeks.length < PACE_MIN_WEEKS) return false;
  return thisWeek > percentile(previousWeeks, 0.5);
}
