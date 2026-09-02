import type { Prisma, TaskStatus } from "@prisma/client";

/**
 * Disponibilidade de uma demanda para EXECUÇÃO.
 *
 * Duas regras, e as duas respondem à mesma pergunta — "isto é trabalho de agora?":
 *
 *   1. Demanda DESCARTADA (obsoleta ou cancelada) não é trabalho de ninguém. O botão "marcar
 *      obsoleta" promete em texto que a demanda sai dos pendentes; antes desta condição, só a
 *      cobertura semanal cumpria a promessa — as etapas continuavam ACTIVE e com dono, e a
 *      demanda seguia no painel de quem a pegou como se nada tivesse acontecido. A condição
 *      mora aqui, e não em cada tela, porque uma regra repetida em cada consulta é uma regra
 *      que vai divergir.
 *   2. Demanda com início planejado no futuro ainda não disputa atenção (regra original, abaixo).
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

/** Os dois status que significam "esta demanda foi descartada". Uma lista só, para que os
 *  fragmentos daqui não divirjam entre si. */
const DISCARDED: TaskStatus[] = ["OBSOLETE", "CANCELLED"];

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
export function availableTaskWhere({
  now = new Date(),
  alsoExclude = [],
}: {
  now?: Date;
  /** Status que ESTA consulta descarta além dos descartados de sempre. Existe para que uma tela
   *  mais estrita ESTENDA a regra em vez de sobrescrever a chave `status` do fragmento: quem
   *  sobrescreve fica certo só enquanto a lista local for superconjunto desta, e passa a ignorar
   *  em silêncio qualquer status que apareça aqui depois. */
  alsoExclude?: TaskStatus[];
} = {}): Prisma.TaskWhereInput {
  return {
    // Descartada não é trabalho: nem de quem executa, nem da programação.
    status: { notIn: [...DISCARDED, ...alsoExclude] },
    OR: [{ plannedStartAt: null }, { plannedStartAt: { lte: now } }],
  };
}

/** O mesmo, para consultas que partem de `TaskActiveStage` (a maioria das telas
 *  de execução lista ETAPAS, não tarefas). */
export function availableStageWhere(now: Date = new Date()): Prisma.TaskActiveStageWhereInput {
  return { task: availableTaskWhere({ now }) };
}

/**
 * Só a metade "não descartada", para as telas de PLANEJAMENTO.
 *
 * Elas não podem usar `availableStageWhere`: a regra de início planejado esconde trabalho futuro,
 * e enxergar trabalho futuro é justamente o ponto delas — a semana que vem é onde se distribui.
 * Mas demanda obsoleta ou cancelada não ocupa dia de ninguém, e sem esta condição a grade
 * continuava reservando espaço para trabalho que foi descartado.
 */
export function notDiscardedStageWhere(): Prisma.TaskActiveStageWhereInput {
  return { task: { status: { notIn: DISCARDED } } };
}
