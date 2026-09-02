/**
 * O filtro de equipes da mesa semanal (`/planning/week`), que é múltiplo e tem um PADRÃO.
 *
 * A mesa distribui trabalho de produção. Abri-la mostrando todas as equipes coloca RH, Coordenação
 * e afins no meio da grade — pessoas que não recebem etapa de fluxo —, e o gestor passa a filtrar
 * na cabeça toda vez que abre a tela. Por isso o estado sem parâmetro não é "tudo": é "o trabalho
 * operacional". Quem quer as equipes de apoio pede por elas, e a opção continua ali.
 *
 * Três estados, e só três:
 *
 *   - `"default"` — sem `?team` (ou com ele vazio): todas menos as ocultas por configuração;
 *   - `"all"`     — `?team=all`: tudo, inclusive as ocultas;
 *   - `string[]`  — `?team=id1,id2`: exatamente essas.
 *
 * Puro e separado da consulta porque é regra, não plumbing: a página resolve o recorte ANTES de
 * consultar, para a grade nunca renderizar um conjunto enquanto o controle afirma outro.
 */

/** Sentinela de "todas, inclusive as ocultas". Não colide com id de equipe (cuid). */
export const TEAM_PARAM_ALL = "all";

export type TeamFilterMode = "default" | "all" | string[];

/**
 * Lê o `?team` da URL. Aceita a forma com vírgula (a que a tela escreve) e a forma repetida
 * (`?team=a&team=b`, que o Next entrega como array) — uma URL compartilhada tem que abrir onde
 * foi copiada, não importa quem a montou.
 */
export function parseTeamParam(raw: string | string[] | undefined): TeamFilterMode {
  const bruto = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  if (bruto.trim() === TEAM_PARAM_ALL) return "all";

  const ids = bruto
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  // Lista que sobrou vazia (`?team=`, `?team=,`) é ruído de URL editada à mão, não o pedido de uma
  // grade vazia: esconder a semana inteira por causa de uma vírgula seria perder trabalho de vista
  // sem ninguém ter pedido.
  return ids.length > 0 ? ids : "default";
}

/**
 * O modo que de fato vale, depois de descartar id que não existe mais (link antigo, equipe apagada)
 * e de cair no padrão quando a seleção inteira morreu.
 *
 * Existe porque a TELA precisa marcar o que está APLICADO, não o que a URL pediu: uma caixa marcada
 * para um time que sumiu do banco, ou uma lista de caixas marcadas enquanto a grade mostra o
 * padrão, é o controle contradizendo a grade ao lado.
 */
export function effectiveTeamMode(
  mode: TeamFilterMode,
  teams: { id: string; name: string }[]
): TeamFilterMode {
  if (mode === "default" || mode === "all") return mode;
  const existentes = new Set(teams.map((t) => t.id));
  const validos = mode.filter((id) => existentes.has(id));
  return validos.length > 0 ? validos : "default";
}

/**
 * O recorte que a consulta recebe. `undefined` significa SEM recorte — é o que as consultas já
 * entendem, e evita trocar um `where` ausente por um `IN` com todos os ids à toa.
 *
 * `hiddenNames` vem do locale (`planning.week.defaultHiddenTeams`), a mesma convenção que os
 * relatórios já usam para "equipes que não são trabalho operacional". É por NOME, e nome muda no
 * cadastro sem avisar: o pior caso desse acoplamento é uma equipe voltar a aparecer no padrão —
 * nunca uma tela quebrada —, e o custo de evitá-lo seria uma coluna nova em `Team` com tela de
 * cadastro junto.
 */
export function resolveTeamIds(
  mode: TeamFilterMode,
  teams: { id: string; name: string }[],
  hiddenNames: string[]
): string[] | undefined {
  if (mode === "all") return undefined;

  if (mode === "default") {
    const ocultos = new Set(hiddenNames);
    const visiveis = teams.filter((t) => !ocultos.has(t.name));
    // Nenhuma equipe oculta de fato (lista vazia, ou nomes que não existem no banco) = sem recorte.
    return visiveis.length === teams.length ? undefined : visiveis.map((t) => t.id);
  }

  // Id que não existe mais — link antigo, equipe apagada — filtraria por nada e devolveria uma
  // grade vazia sem explicar por quê. Some da seleção; se a seleção inteira morreu, cai no padrão.
  const existentes = new Set(teams.map((t) => t.id));
  const validos = mode.filter((id) => existentes.has(id));
  return validos.length > 0 ? validos : resolveTeamIds("default", teams, hiddenNames);
}
