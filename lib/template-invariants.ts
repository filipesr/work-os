/**
 * Trava recíproca entre a marca de fluxo rápido e a quantidade de etapas.
 *
 * A regra vive aqui, pura, porque tem DOIS consumidores com papéis diferentes: a tela usa para
 * desabilitar o controle e escrever o motivo ao lado; o servidor usa para garantir. Se cada um
 * tivesse a sua cópia, divergiriam na primeira mudança — e a divergência apareceria como um botão
 * habilitado que devolve erro, que é a pior forma de descobrir uma regra.
 */

/** Só um fluxo de etapa única pode ser marcado como rápido. */
export function canEnableQuickEntry(stageCount: number): boolean {
  return stageCount === 1;
}

/** Um fluxo rápido já com sua etapa não aceita outra; qualquer outro caso aceita. */
export function canAddStage(args: { stageCount: number; quickEntry: boolean }): boolean {
  if (!args.quickEntry) return true;
  // Marca ativa e nenhuma etapa é estado transitório: bloquear prenderia o template em zero.
  return args.stageCount === 0;
}

/** Template sem etapa não deve existir — a última não sai. */
export function canDeleteStage(stageCount: number): boolean {
  return stageCount > 1;
}
