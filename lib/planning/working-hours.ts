import { nowInSaoPaulo } from "@/lib/dates";

/**
 * Horas ÚTEIS decorridas entre dois instantes.
 *
 * Existe porque a mesa semanal compara duas coisas que precisam estar na mesma unidade: a
 * referência da etapa é hora de TRABALHO (p50 de `TimeLog.hoursSpent`, tipicamente 1–8h), e o
 * decorrido, se medido no relógio, traria madrugada e fim de semana dentro. Uma etapa de 2h ativa
 * desde ontem imprimiria "24h nesta etapa · referência 2h": o aviso acenderia em quase toda célula
 * e a gestão por exceção morreria — um sinal que acende sempre não é sinal.
 *
 * A regra é a mesma do planejamento para trás (`lib/calendar/planning-dates.ts`): dia útil vale 8h,
 * sábado e domingo valem zero. Dentro de um dia útil, a fração do dia de calendário coberta vira a
 * mesma fração da jornada.
 *
 * Isso é APROXIMAÇÃO DELIBERADA, e é o máximo que o sistema pode afirmar: não existe escala
 * cadastrada — o app não sabe quem trabalha sábado nem quem faz meio período (é a mesma razão de a
 * régua de 8h do dia ser assumidamente visual). Fingir uma jornada das 9 às 18 seria mentira com
 * ares de precisão. Feriado também não é descontado: o app conhece feriados de três países e qual
 * se aplica depende do cliente — descontar o errado erraria a conta com cara de exatidão.
 */

/** Jornada de um dia útil. Mesmo número de `HORAS_POR_DIA_UTIL` no planejamento para trás. */
export const HOURS_PER_WORKING_DAY = 8;

const DAY_MS = 86_400_000;

/** Sábado ou domingo, no calendário de São Paulo. `getUTCDay()`: 0 = domingo, 6 = sábado. */
function isFimDeSemana(spLocal: Date): boolean {
  const dia = spLocal.getUTCDay();
  return dia === 0 || dia === 6;
}

export function workingHoursBetween(from: Date, to: Date): number {
  // Convenção de `lib/dates.ts`: os campos getUTC* passam a refletir o calendário de São Paulo, que
  // é onde "sábado" quer dizer sábado.
  const inicio = nowInSaoPaulo(from).getTime();
  const fim = nowInSaoPaulo(to).getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return 0;

  // Semanas inteiras de uma vez: uma etapa esquecida há meses não pode custar um laço de centenas
  // de voltas a cada célula da grade. Sete dias corridos contêm sempre cinco dias úteis, qualquer
  // que seja o ponto de partida.
  const SEMANA_MS = 7 * DAY_MS;
  const semanas = Math.floor((fim - inicio) / SEMANA_MS);
  let total = semanas * 5 * HOURS_PER_WORKING_DAY;

  let cursor = new Date(inicio + semanas * SEMANA_MS);
  cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()));
  const resto = inicio + semanas * SEMANA_MS;

  // O que sobrou (menos de sete dias), dia a dia: a fração do dia coberta vira a mesma fração da
  // jornada.
  for (let t = cursor.getTime(); t < fim; t += DAY_MS) {
    if (isFimDeSemana(new Date(t))) continue;
    const coberto = Math.min(fim, t + DAY_MS) - Math.max(resto, t);
    if (coberto > 0) total += (coberto / DAY_MS) * HOURS_PER_WORKING_DAY;
  }
  return total;
}

/**
 * O instante que, medido no RELÓGIO, dá exatamente as horas úteis já decorridas desde `from`.
 *
 * Serve para alimentar `stageAgingRatio` — que continua sendo a única função que decide se uma
 * etapa passou da referência — com a unidade certa, em vez de escrever uma segunda regra de
 * envelhecimento ao lado dela. Duas implementações da mesma leitura divergiriam.
 */
export function workingClockEquivalent(from: Date, now: number = Date.now()): Date {
  return new Date(now - workingHoursBetween(from, new Date(now)) * 3.6e6);
}
