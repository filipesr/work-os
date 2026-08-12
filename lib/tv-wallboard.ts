// Conta de serviço do wallboard (modo TV). NÃO é "use server": exporta helpers
// puros + leitores de cookie usados por Server Components, rotas de API e testes.
//
// Por que existe: o monitor de parede precisa ler a presença do time, mas não é
// uma pessoa — não deveria carregar a sessão de ninguém. Antes a /tv exigia
// apenas `requireMemberOrHigher`, uma barra MENOR que a do board
// (`requireManagerOrAdmin`), o que virava um contorno: quem não podia abrir o
// board via o mesmo dado (incluindo o nome do cliente) abrindo /tv.
//
// O token é um segredo único de instalação (env `TV_WALLBOARD_TOKEN`), não uma
// credencial por dispositivo — o escopo que ele concede é minúsculo e read-only
// (só os três getters de presença). Rotacionar = trocar a env e reabrir a URL.

/** Cookie httpOnly que carrega o token depois da primeira visita autenticada. */
export const WALLBOARD_COOKIE = "workos.tv-wallboard";

/** 1 ano: o monitor de parede é ligado e esquecido; expirar a sessão dele em
 *  dias significa alguém subir numa escada para reautenticar uma TV. */
export const WALLBOARD_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Comparação em tempo constante do token apresentado contra o configurado.
 *
 * Retorna false quando o esperado está vazio/ausente — **fail-closed**: uma
 * instalação sem `TV_WALLBOARD_TOKEN` não ganha um wallboard aberto por
 * acidente, ela simplesmente não tem conta de serviço (a /tv volta a exigir
 * sessão de gestor).
 *
 * Implementado com acumulador XOR em vez de `node:crypto.timingSafeEqual` para
 * o módulo rodar em QUALQUER runtime — inclusive no middleware, que precisa do
 * nome do cookie e não deve carregar APIs de Node. O laço não sai no primeiro
 * byte diferente, então o tempo não revela o prefixo correto.
 *
 * Comprimentos diferentes são rejeitados de saída. Isso vaza o comprimento do
 * segredo, não seu conteúdo — irrelevante para um token de alta entropia.
 */
export function verifyWallboardToken(
  presented: string | undefined | null,
  expected: string | undefined | null
): boolean {
  if (!presented || !expected) return false;
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
