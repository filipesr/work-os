/**
 * Quando concluir uma etapa pede um MOTIVO.
 *
 * O apontamento voluntário falha de dois jeitos opostos, e os dois envenenam o p50 que o sistema
 * oferece a todo mundo: ninguém ligou o cronômetro (a etapa fecha com quase nada) ou ninguém o
 * desligou (fecha com trinta horas porque o chefe chegou e mandou fazer outra coisa). São duas
 * histórias diferentes, e por isso a pergunta é uma só com respostas diferentes.
 *
 * A faixa de ±10% foi rejeitada de propósito: a referência é um p50, então metade das execuções
 * fica naturalmente acima dele. Justificativa que aparece toda vez deixa de ser lida — e ensina a
 * apontar o número que não pergunta nada.
 *
 * Pura porque a mesma regra decide o que a tela mostra e o que o servidor aceita. Duas cópias
 * divergiriam, e a divergência apareceria como um diálogo que não pede nada e uma ação que recusa.
 */

/** Abaixo desta fração da referência, o apontamento quase sempre quer dizer "esqueci o relógio". */
export const LOW_LOG_RATIO = 0.1;

export type StageNoteReasonValue =
  | "EXTERNAL_INTERRUPTION"
  | "REWORK"
  | "SCOPE_LARGER"
  | "TIMER_FORGOTTEN"
  | "OTHER";

/** Ordem da lista na tela: do que revela problema de fora para o que revela problema do processo. */
export const STAGE_NOTE_REASONS: readonly StageNoteReasonValue[] = [
  "EXTERNAL_INTERRUPTION",
  "REWORK",
  "SCOPE_LARGER",
  "TIMER_FORGOTTEN",
  "OTHER",
] as const;

export function needsReason(hoursLogged: number, referenceHours: number): boolean {
  // Sem régua não há extremo: etapa sem amostra e sem SLA cadastrado não pergunta nada.
  if (referenceHours <= 0) return false;
  if (hoursLogged > referenceHours) return true;
  return hoursLogged <= referenceHours * LOW_LOG_RATIO;
}
