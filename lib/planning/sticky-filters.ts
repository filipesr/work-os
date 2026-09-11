/**
 * Filtros que sobrevivem ao recarregamento, guardados no NAVEGADOR.
 *
 * O caso que motivou: o social media que atende a AtlanticoShop abre a mesa do gestor todo dia e
 * filtra pelas mesmas três pessoas. Sem isto, ele refaz o filtro a cada visita.
 *
 * **Fica no navegador de propósito, não no banco.** É preferência de quem olha, não dado da
 * operação: não precisa de migração, não precisa ser lida por mais ninguém, e não deve seguir a
 * pessoa para outro computador sem que ela peça.
 *
 * **A URL sempre ganha.** O restaurado só entra quando a URL não trouxe filtro nenhum — senão um
 * link compartilhado mostraria uma tela diferente para cada pessoa que o abrisse, que é o oposto do
 * que um link serve para fazer. Ver `useStickyFilters`.
 *
 * O risco de um filtro invisível que sobrevive ao recarregamento — a pessoa acha que o dado sumiu —
 * é real, e não se resolve aqui: resolve-se na barra, mostrando toda escolha ativa como tag
 * removível. Este módulo só guarda e devolve.
 */

const PREFIX = "workos:planning:filters";

/** Chave de armazenamento da tela. Por tela: a mesa do gestor e o calendário filtram coisas
 *  diferentes, e herdar o filtro de um no outro seria surpresa, não conveniência. */
export function storageKey(scope: string): string {
  return `${PREFIX}:${scope}`;
}

/** O que uma tela guarda: parâmetro → valor, sempre texto (é o que vai para a URL). */
export type StickyFilters = Record<string, string>;

/**
 * Lê os filtros salvos, ficando **só nas chaves que a tela declara**.
 *
 * Conteúdo corrompido ou de outra versão devolve vazio em vez de lançar: um `localStorage` que
 * alguém editou à mão não pode derrubar a tela, e abrir sem filtro é o pior caso aceitável.
 */
export function readSticky(scope: string, keys: string[]): StickyFilters {
  if (typeof window === "undefined") return {};

  let bruto: unknown;
  try {
    const cru = window.localStorage.getItem(storageKey(scope));
    if (!cru) return {};
    bruto = JSON.parse(cru);
  } catch {
    return {};
  }

  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};

  const salvos = bruto as Record<string, unknown>;
  const saida: StickyFilters = {};
  for (const key of keys) {
    const valor = salvos[key];
    if (typeof valor === "string" && valor !== "") saida[key] = valor;
  }
  return saida;
}

/**
 * Grava a seleção inteira, substituindo a anterior.
 *
 * Substitui, e não mescla: mesclar faria um filtro removido ressuscitar no carregamento seguinte —
 * o parâmetro sai da URL, mas continuaria no armazenamento e voltaria sozinho.
 */
export function writeSticky(scope: string, filters: StickyFilters): void {
  if (typeof window === "undefined") return;

  const limpo: StickyFilters = {};
  for (const [k, v] of Object.entries(filters)) {
    if (typeof v === "string" && v !== "") limpo[k] = v;
  }

  try {
    if (Object.keys(limpo).length === 0) window.localStorage.removeItem(storageKey(scope));
    else window.localStorage.setItem(storageKey(scope), JSON.stringify(limpo));
  } catch {
    // Armazenamento cheio ou bloqueado (aba anônima com cookies restritos): a tela funciona sem
    // persistência, e travá-la por causa de uma conveniência seria trocar o essencial pelo acessório.
  }
}
