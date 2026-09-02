/**
 * A matemática da janela fixa: que faixa cada compromisso ocupa, quem colide com quem, quem vence
 * e para onde vai o perdedor.
 *
 * Pura e separada das ações porque é aqui que o erro é silencioso: nada quebra se a faixa sair
 * errada — só duas pessoas aparecem no mesmo estúdio às 14h.
 */

/** Etapa sem referência nenhuma. Ver `occupiedRange`. */
export const NO_REFERENCE_MS = 3_600_000;

export type WindowInput = {
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  /** Horas de referência da ETAPA (`lib/planning/stage-reference.ts`), não do que foi combinado. */
  referenceHours: number;
};

export type Range = { start: Date; end: Date };

/**
 * A faixa ocupada, em três casos:
 *
 *   1. fim declarado → é ele, porque é o compromisso real;
 *   2. sem fim → início + referência da etapa, o "range estimado necessário";
 *   3. sem fim e sem referência → 1h de convenção, dita na tela.
 *
 * O caso 3 existe porque uma faixa de duração zero não colidiria com nada, e a trava de
 * sobreposição inteira viraria decorativa para toda etapa sem amostra nem SLA.
 *
 * Usar a referência aqui não é apresentar estimativa como verdade (P7): ela não promete nada a
 * ninguém e não aparece como compromisso na tela — serve só para detectar que dois compromissos vão
 * se atropelar. A promessa continua sendo o início, que é o que foi combinado.
 */
export function occupiedRange(item: WindowInput): Range | null {
  if (!item.scheduledStart) return null;
  if (item.scheduledEnd) return { start: item.scheduledStart, end: item.scheduledEnd };
  const duracao = item.referenceHours > 0 ? item.referenceHours * 3_600_000 : NO_REFERENCE_MS;
  return { start: item.scheduledStart, end: new Date(item.scheduledStart.getTime() + duracao) };
}

/** Duas faixas se atropelam? Encostar NÃO é colidir: 14h–16h e 16h–17h convivem, e tratar a borda
 *  como conflito proibiria a agenda cheia e legítima. */
export function rangesOverlap(a: Range, b: Range): boolean {
  return a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
}

/** Quem, entre os já ocupados, está no caminho da faixa nova. Devolve os objetos de origem — o
 *  chamador precisa dizer ao gestor QUAL demanda está ali, não só que existe uma. */
export function collidingWith<T extends { range: Range }>(nova: Range, ocupadas: T[]): T[] {
  return ocupadas.filter((o) => rangesOverlap(nova, o.range));
}
