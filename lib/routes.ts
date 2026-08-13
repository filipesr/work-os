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
/**
 * Seções que agrupam telas sem ter página própria. Sem isto, quem digita ou
 * guarda o endereço da seção recebe 404 — e, pior, `/planejamento` desviava com
 * 308 permanente para um `/planning` que não existe: o navegador guarda esse
 * desvio e nem tenta de novo.
 *
 * Casa por igualdade EXATA, nunca por prefixo: como prefixo, `/planning` pegaria
 * `/planning/coverage` e o mandaria para o calendário.
 */
const SECTION_LANDINGS: Readonly<Record<string, string>> = {
  "/planning": "/planning/calendar/week",
};

function resolveSectionLanding(pathnameWithoutLocale: string): string | null {
  return SECTION_LANDINGS[pathnameWithoutLocale] ?? null;
}

/** Rota da visão semanal — destino de quem chega ao calendário sem dizer qual quer. */
export const CALENDAR_WEEK_PATH = "/planning/calendar/week";
/** Rota da visão mensal. */
export const CALENDAR_MONTH_PATH = "/planning/calendar/month";

/**
 * O calendário era uma tela só com `?view=week|month`; virou duas rotas. Esta
 * função traduz a forma antiga, inclusive a implícita (`/planning/calendar` sem
 * parâmetro, que caía na semana por padrão).
 *
 * Separada de `resolveLegacyPath` porque depende da QUERY, não só do caminho — e
 * o middleware combina as duas num único 308, em vez de encadear dois.
 */
export function resolveCalendarView(
  pathnameWithoutLocale: string,
  view: string | null
): string | null {
  if (pathnameWithoutLocale !== "/planning/calendar") return null;
  return view === "month" ? CALENDAR_MONTH_PATH : CALENDAR_WEEK_PATH;
}

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

/**
 * Destino final de um endereço, combinando as duas regras num ÚNICO desvio, ou
 * null se ele já está onde deve.
 *
 * A combinação importa: `/planejamento/calendario?view=month` precisa da regra
 * de renomeação E da de visão. Aplicadas em sequência pelo navegador seriam dois
 * 308 — duas viagens por link. Aqui a conta é feita antes de responder.
 *
 * Vive aqui, e não no middleware, para ser testável: era a única parte da
 * cadeia de redirecionamento sem cobertura.
 */
export function resolveRedirectTarget(
  pathnameWithoutLocale: string,
  view: string | null
): { pathname: string; dropView: boolean } | null {
  const renomeado = resolveLegacyPath(pathnameWithoutLocale);
  const aterrissagem = resolveSectionLanding(renomeado ?? pathnameWithoutLocale);
  if (aterrissagem) return { pathname: aterrissagem, dropView: false };

  const semanaOuMes = resolveCalendarView(renomeado ?? pathnameWithoutLocale, view);
  // `view` cumpriu o papel ao escolher a rota; levá-lo adiante deixaria o
  // endereço novo carregando o vocabulário do antigo.
  if (semanaOuMes) return { pathname: semanaOuMes, dropView: true };
  if (renomeado) return { pathname: renomeado, dropView: false };
  return null;
}
