/**
 * O prazo da demanda: obrigatório, a menos que alguém diga o contrário POR ESCRITO.
 *
 * Uma demanda sem `dueDate` não é uma demanda com um campo em branco — ela desaparece do
 * acompanhamento inteiro: `demandState` nunca a marca como atrasada, a cobertura semanal por
 * cliente não a enxerga (a consulta filtra por faixa de prazo), a taxa de entrega no prazo a
 * exclui, e a carga do time a conta como "no prazo". Deixar isso acontecer por distração é criar
 * trabalho invisível.
 *
 * Mas demanda sem prazo existe de verdade — trabalho contínuo, demanda de apoio. Por isso a saída
 * não é proibir: é exigir que a ausência seja MARCADA. A tela pergunta, a pessoa responde, e o
 * sistema passa a saber a diferença entre "não tem prazo" e "esqueceram de preencher".
 *
 * Puro de propósito: é a regra que decide o que o resto do sistema consegue ver, e erra em
 * silêncio — nenhuma tela quebra quando uma demanda nasce sem prazo por engano.
 */

/** Só formato ISO. `new Date("15/09/2026")` devolve datas surpreendentes em alguns runtimes. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export type DueDateProblem = "required" | "invalid";

export function resolveDueDate(
  dueDateStr: string,
  noDueDate: boolean
): { date: Date | null } | { problem: DueDateProblem } {
  // A marca vence a data digitada: quem marcou a caixa decidiu depois de digitar. Gravar o prazo
  // assim mesmo mostraria à pessoa o oposto do que ela pediu.
  if (noDueDate) return { date: null };

  if (!dueDateStr) return { problem: "required" };
  if (!DATE_ONLY.test(dueDateStr)) return { problem: "invalid" };

  const date = new Date(`${dueDateStr}T00:00:00.000Z`);
  // Pega o 31 de fevereiro: o formato passa no regex, mas a data não existe.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dueDateStr) {
    return { problem: "invalid" };
  }

  // Data no passado é aceita: registrar uma demanda que já venceu é legítimo, e a checagem de
  // viabilidade da tela já avisa quando o prazo não fecha.
  return { date };
}
