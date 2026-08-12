// Normalização do termo de busca vindo da URL. Puro e testável: é a fronteira
// entre o que o usuário digita e o que vai para o `contains` do Prisma.

/** Teto de tamanho: um termo absurdo não deve virar um LIKE gigante no banco. */
export const SEARCH_TERM_MAX = 100;

/**
 * Normaliza `?q=` em um termo utilizável, ou `undefined` quando não há busca.
 *
 * Retornar `undefined` (e não `""`) importa: o caller usa isso para decidir se
 * inclui a cláusula `where` — e `contains: ""` casa com tudo, o que parece
 * inofensivo até virar um scan desnecessário em toda visita à lista.
 *
 * Espaço em branco puro conta como "sem busca": quem apagou o campo e deixou um
 * espaço não pediu para filtrar nada.
 */
export function parseSearchTerm(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  if (typeof single !== "string") return undefined;
  const trimmed = single.trim().slice(0, SEARCH_TERM_MAX);
  return trimmed.length > 0 ? trimmed : undefined;
}
