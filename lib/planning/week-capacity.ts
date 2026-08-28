/**
 * Constantes de capacidade da mesa semanal.
 *
 * Moram FORA de `lib/actions/week-planning.ts` de propósito: aquele arquivo tem `"use server"` no
 * topo, e o Next só permite exportar função assíncrona de um arquivo `"use server"` — `export
 * const` quebra o build (`next build`), mesmo passando limpo em tsc e vitest, que não aplicam essa
 * regra. `getWeekPlanning` importa os dois valores daqui para uso interno.
 */

/** Referência semanal de quem não tem `weeklyCapacityHours` preenchido. */
export const DEFAULT_WEEKLY_HOURS = 45;

/** Régua VISUAL do dia. Não é meta: ver o comentário em `week-planning.ts`. */
export const DAY_VISUAL_HOURS = 8;
