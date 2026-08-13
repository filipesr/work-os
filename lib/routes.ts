/**
 * Single source of truth for route segments (without locale prefix) that require
 * an authenticated session. Used by `middleware.ts` to redirect anonymous users to
 * sign-in. Keep in sync with the `(protected)` route group — adding a top-level
 * protected segment means adding it here too.
 */
export const PROTECTED_PATHS = [
  "/dashboard",
  "/tasks",
  "/admin",
  "/reports",
  "/planning",
  "/projects",
  "/my-evolution",
  "/help",
  "/account",
  // /tv não está em (protected): tem layout próprio (wallboard, sem navegação)
  // e autentica por conta de serviço além de sessão. Ver lib/tv-wallboard.ts.
  "/tv",
] as const;

/** True when `pathname` (locale already stripped) falls under a protected segment. */
export function isProtectedPath(pathnameWithoutLocale: string): boolean {
  return PROTECTED_PATHS.some((path) => pathnameWithoutLocale.startsWith(path));
}

/**
 * Endereços que mudaram, e para onde foram. Chave = antigo, valor = atual.
 *
 * As rotas de planejamento nasceram em português enquanto o resto do app estava
 * em inglês (/dashboard, /reports, /projects). Caminho é identificador de código,
 * não texto de interface — quem traduz a tela é o i18n, e a URL é a mesma nos dois
 * idiomas. Uniformizamos; isto aqui é o que sustenta os links já espalhados.
 */
export const LEGACY_PATH_REDIRECTS: Readonly<Record<string, string>> = {
  "/planejamento": "/planning",
  "/planejamento/calendario": "/planning/calendar",
  "/planejamento/cobertura": "/planning/coverage",
  "/planejamento/datas": "/planning/dates",
  "/minha-evolucao": "/my-evolution",
  // O calendário também já morou em "Relatórios". Aponta direto para o endereço
  // atual: encadear 308 faria o navegador pagar duas viagens pelo mesmo link.
  "/reports/calendar": "/planning/calendar",
};

/**
 * Destino atual de um caminho antigo, ou null se ele não mudou de nome.
 *
 * Roda no middleware, ANTES de renderizar: o redirecionamento vira um 308 de
 * verdade. Feito na página, o layout autenticado renderiza inteiro (~140 kB, com
 * busca de sessão e navegação) antes de o Next descobrir que era para desviar, e
 * o desvio sai como NEXT_REDIRECT no payload RSC — 200 disfarçado de 308.
 */
export function resolveLegacyPath(pathnameWithoutLocale: string): string | null {
  // Do mais longo para o mais curto: senão `/planejamento` casaria antes de
  // `/planejamento/datas` e mandaria todo mundo para a raiz do planejamento.
  const antigos = Object.keys(LEGACY_PATH_REDIRECTS).sort((a, b) => b.length - a.length);

  for (const antigo of antigos) {
    if (pathnameWithoutLocale === antigo || pathnameWithoutLocale.startsWith(`${antigo}/`)) {
      // Preserva o que vem depois — sub-rotas e parâmetros dinâmicos futuros.
      return LEGACY_PATH_REDIRECTS[antigo] + pathnameWithoutLocale.slice(antigo.length);
    }
  }
  return null;
}
