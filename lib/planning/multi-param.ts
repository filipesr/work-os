/**
 * Seleção MÚLTIPLA num parâmetro de URL (`?user=ana,bruno`).
 *
 * Existe porque o filtro de uma pessoa por vez não responde à pergunta que o gestor faz de fato:
 * "quero ver o time com quem eu trabalho". O filtro de equipes da mesa (`lib/planning/team-filter`)
 * já era múltiplo; isto generaliza a mesma ideia para qualquer lista de ids.
 *
 * **Lista vazia significa TODOS, nunca NENHUM.** É a convenção que o filtro de equipes já usa, e o
 * motivo é o mesmo: desmarcar a última opção precisa devolver a grade inteira, não deixar a tela em
 * branco por um clique a mais.
 */

/**
 * Lê a seleção do parâmetro, **descartando id que não existe mais**.
 *
 * O descarte não é higiene: sem ele, quem filtrou por uma pessoa que depois saiu da equipe abre a
 * tela vazia com um filtro que não dá para desmarcar — a opção sumiu do seletor junto com ela.
 */
export function parseMultiParam(value: string | undefined, validIds: string[]): string[] {
  if (!value) return [];

  const validos = new Set(validIds);
  const escolhidos: string[] = [];

  for (const raw of value.split(",")) {
    const id = raw.trim();
    if (id && validos.has(id) && !escolhidos.includes(id)) escolhidos.push(id);
  }

  return escolhidos;
}

/** O valor para a URL, ou `null` para TIRAR o parâmetro — `?user=` vazio parece filtro ativo. */
export function serializeMultiParam(ids: string[]): string | null {
  return ids.length > 0 ? ids.join(",") : null;
}

/** Marca ou desmarca um id, preservando a ordem de escolha. */
export function toggleInMulti(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
}
