/**
 * Contador de navegações EM VOO, para a barra de progresso do topo.
 *
 * O App Router não emite eventos de navegação — não há `router.events` como no Pages Router —, e o
 * `useLinkStatus` que resolveria isso só existe do Next 15.3 em diante (estamos no 15.1). Então
 * quem inicia uma navegação programática avisa daqui, e a barra escuta.
 *
 * **O que este contador NÃO cobre:** clique em `<Link>`. Para esses, quem dá o retorno é o
 * `loading.tsx` da rota de destino, que o Next mostra sozinho. A divisão é essa, e é coerente:
 * mudança de ROTA tem esqueleto; mudança de PARÂMETRO (filtro, semana) tem barra, porque ali a
 * rota não muda e o `loading.tsx` não dispara.
 *
 * É um contador, e não um booleano, porque duas navegações podem se sobrepor — trocar o filtro
 * enquanto a semana anterior ainda carrega. Com booleano, a primeira a terminar apagaria a barra
 * com a segunda ainda em voo.
 */

let emVoo = 0;
const ouvintes = new Set<() => void>();

function avisar() {
  for (const o of ouvintes) o();
}

/** Registra o início de uma navegação. Todo `inicio` precisa do seu `fim`. */
export function navegacaoIniciou(): void {
  emVoo += 1;
  avisar();
}

/** Registra o fim. Nunca deixa o contador negativo: um `fim` a mais (efeito que roda duas vezes em
 *  modo estrito, por exemplo) não pode travar a barra acesa para sempre. */
export function navegacaoTerminou(): void {
  emVoo = Math.max(0, emVoo - 1);
  avisar();
}

/** Quantas navegações estão em voo. Exportado para teste e para `useSyncExternalStore`. */
export function navegacoesEmVoo(): number {
  return emVoo;
}

export function assinarNavegacao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Só para teste: devolve o contador ao zero entre casos. */
export function resetarNavegacao(): void {
  emVoo = 0;
  avisar();
}
