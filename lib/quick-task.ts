import { formatISODate, todayInSaoPaulo } from "@/lib/dates";

/**
 * Regras puras da tarefa rápida — registro de trabalho de etapa única que JÁ aconteceu.
 *
 * Vivem separadas da Server Action porque decidem o que as métricas vão dizer sobre essa classe de
 * trabalho para sempre, e erram em silêncio: um lead time carimbado errado não quebra tela nenhuma,
 * só contamina relatório. Regra que erra calada é regra que precisa de teste próprio.
 */

/** Janela retroativa. Sem limite, um lançamento antigo reescreveria relatório já fechado. */
export const QUICK_TASK_MAX_BACKDATE_DAYS = 7;

export type QuickTaskDateError = "future" | "tooOld";

const DIA_MS = 86_400_000;

function diaSaoPauloISO(instant: Date): string {
  return formatISODate(todayInSaoPaulo(instant));
}

/** Null quando a data serve. */
export function validateQuickTaskDate(
  dateISO: string,
  now: Date = new Date()
): QuickTaskDateError | null {
  const hojeISO = diaSaoPauloISO(now);
  if (dateISO > hojeISO) return "future";

  const limite = new Date(
    Date.parse(`${hojeISO}T00:00:00Z`) - QUICK_TASK_MAX_BACKDATE_DAYS * DIA_MS
  );
  if (dateISO < formatISODate(limite)) return "tooOld";
  return null;
}

/**
 * Deriva os três instantes a partir de (data, minutos).
 *
 *   completedAt = fim do trabalho
 *   startedAt   = completedAt − tempo gasto
 *   createdAt   = startedAt
 *
 * Com isso: cycle time = tempo real de trabalho, lead time = o mesmo, queue time = zero. Todos
 * verdadeiros aqui, porque a demanda e a execução foram o mesmo momento.
 *
 * REJEITADO: `createdAt = agora` (instante do registro). Faria o lead time medir quanto a pessoa
 * demorou para lançar no sistema — ruído puro, e pior quanto mais tarde ela lançasse.
 */
export function quickTaskTimestamps(
  dateISO: string,
  minutes: number,
  now: Date = new Date()
): { createdAt: Date; startedAt: Date; completedAt: Date } {
  // Hoje → o instante atual, que é a verdade mais próxima. Dia passado → meio-dia em São Paulo:
  // o horário do dia não é capturado (seria mais um campo, e nenhum relatório usa), e meio-dia é
  // marcador neutro, determinístico e nunca futuro.
  const completedAt =
    dateISO === diaSaoPauloISO(now) ? new Date(now) : new Date(`${dateISO}T12:00:00-03:00`);

  const startedAt = new Date(completedAt.getTime() - minutes * 60_000);
  return { createdAt: new Date(startedAt), startedAt, completedAt };
}
