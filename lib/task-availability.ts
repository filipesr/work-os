/**
 * Disponibilidade de uma demanda para EXECUÇÃO.
 *
 * Uma demanda planejada para começar em 18/11 não é trabalho de hoje. Antes
 * disso ela existe, está agendada e aparece no planejamento — mas não deve
 * disputar atenção nas telas de quem executa, senão a fila de "o que fazer
 * agora" vira a lista de tudo que vai acontecer no trimestre.
 *
 * A regra é APARECE A PARTIR DE, nunca SOME DEPOIS. Uma demanda que já deveria
 * ter começado e não começou precisa continuar visível — é exatamente o caso em
 * que olhar para ela importa mais. Por isso a comparação é `<= agora`, sem
 * limite superior.
 *
 * `plannedStartAt` nulo = sempre disponível: demandas criadas antes deste
 * conceito, ou criadas sem passar pelo planejamento, não podem sumir.
 */

/** Predicado puro, para uso em memória e nos testes. */
export function isAvailableForExecution(
  plannedStartAt: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!plannedStartAt) return true;
  return plannedStartAt.getTime() <= now.getTime();
}

/**
 * Fragmento de `where` do Prisma para filtrar TAREFAS disponíveis.
 *
 * Existe como fragmento único porque a regra vale em várias telas de execução, e
 * uma regra repetida em cada consulta é uma regra que vai divergir — basta uma
 * tela nova esquecer a condição para a demanda futura reaparecer só ali.
 */
export function availableTaskWhere(now: Date = new Date()) {
  return {
    OR: [{ plannedStartAt: null }, { plannedStartAt: { lte: now } }],
  };
}

/** O mesmo, para consultas que partem de `TaskActiveStage` (a maioria das telas
 *  de execução lista ETAPAS, não tarefas). */
export function availableStageWhere(now: Date = new Date()) {
  return { task: availableTaskWhere(now) };
}
