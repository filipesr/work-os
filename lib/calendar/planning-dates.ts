/**
 * Aritmética de datas do PLANEJAMENTO PARA TRÁS.
 *
 * O conceito: uma demanda de campanha não vence no dia do evento — ela precisa
 * estar pronta antes, para o material ser veiculado, instalado ou apresentado.
 * E para estar pronta na data certa, precisa ter começado antes disso.
 *
 *   data de uso        25/12  (Natal — a ocorrência do calendário)
 *   − antecedência     14 dias (julgamento do gestor: 2 semanas rodando)
 *   = prazo (dueDate)  11/12
 *   − duração do fluxo 21 dias (soma das etapas do template)
 *   = início sugerido  20/11
 *
 * Puro e sem fuso: opera sobre strings `yyyy-mm-dd`, que é como as datas
 * trafegam nos formulários e no `CalendarOccurrence.date` (meia-noite UTC
 * representando o dia em São Paulo — convenção de lib/dates.ts). Fazer a conta
 * em `Date` local reintroduziria o erro de um dia perto da virada.
 */

const DIA_MS = 8.64e7;

/** `yyyy-mm-dd` → Date em UTC. Null se a string não for uma data válida. */
function parseIso(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * `iso` menos `dias`. Devolve "" quando qualquer entrada é inválida ou vazia —
 * o caller trata isso como "ainda não dá para calcular", que é o estado do
 * formulário antes de o gestor informar a antecedência.
 *
 * Aceita `dias` como string porque vem de `<input type="number">`, onde o valor
 * é sempre texto e pode estar vazio.
 */
export function subtractDays(iso: string, dias: string | number): string {
  const base = parseIso(iso);
  if (!base) return "";

  const n = typeof dias === "number" ? dias : dias.trim() === "" ? NaN : Number(dias);
  if (!Number.isFinite(n) || n < 0) return "";

  return toIso(new Date(base.getTime() - Math.floor(n) * DIA_MS));
}

/** Diferença em dias inteiros entre duas datas ISO (`ate` − `de`). Null se inválidas. */
export function daysBetweenIso(de: string, ate: string): number | null {
  const a = parseIso(de);
  const b = parseIso(ate);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / DIA_MS);
}

/** Horas de trabalho por dia. A previsão das etapas é em horas; a agenda é em dias. */
export const HORAS_POR_DIA_UTIL = 8;

/** Sábado ou domingo. `getUTCDay()`: 0 = domingo, 6 = sábado. */
function isFimDeSemana(d: Date): boolean {
  const dia = d.getUTCDay();
  return dia === 0 || dia === 6;
}

/**
 * Horas de previsão → dias ÚTEIS de trabalho, arredondando para cima.
 *
 * Para cima porque 9h não cabem num dia de 8h: exigem dois. Arredondar para
 * baixo espremeria o cronograma exatamente onde ele já não cabe.
 */
export function horasParaDiasUteis(horas: number): number {
  return Math.ceil(horas / HORAS_POR_DIA_UTIL);
}

/**
 * O dia útil em que o trabalho precisa COMEÇAR para terminar em `fimIso`,
 * dispondo de `diasUteis` dias de trabalho.
 *
 * A contagem é INCLUSIVA nas duas pontas: 1 dia útil com entrega na segunda
 * significa começar e terminar na segunda — não na sexta anterior. Foi a decisão
 * que exigiu mais cuidado aqui, porque a intuição de "subtrair N dias" dá sempre
 * um dia a mais de folga do que existe.
 *
 * Quando `fimIso` cai no fim de semana, o último dia de trabalho vira a sexta
 * anterior: ninguém entrega no sábado, e contar a partir dele daria um início
 * mais tarde do que o real.
 */
export function startForWorkingDays(fimIso: string, diasUteis: number): string {
  const fim = parseIso(fimIso);
  if (!fim || !Number.isFinite(diasUteis) || diasUteis < 1) return "";

  // Recua até um dia útil: prazo no sábado significa pronto até sexta.
  const cursor = new Date(fim.getTime());
  while (isFimDeSemana(cursor)) cursor.setUTCDate(cursor.getUTCDate() - 1);

  // O próprio dia final já conta como o primeiro dos dias úteis (inclusivo).
  let restantes = diasUteis - 1;
  while (restantes > 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!isFimDeSemana(cursor)) restantes--;
  }
  return toIso(cursor);
}

/**
 * Início sugerido: o prazo recuado pelo tempo que o fluxo inteiro consome.
 *
 * `totalHoras` é a soma de `expectedDurationHours` das etapas do template — o
 * mesmo número que serve de SLA por etapa, agora somado para responder "quando
 * isto precisa começar?".
 *
 * A conversão é 8h por dia, de segunda a sexta. Feriado NÃO é descontado: o app
 * conhece feriados de três países (AR/BR/PY) via `CalendarOccurrence`, e qual
 * deles se aplica depende do cliente — descontar o feriado errado erraria a data
 * com ares de precisão. O sábado e o domingo são universais; o feriado não.
 *
 * Devolve "" quando não há duração configurada — sem isso a conta produziria
 * "comece hoje" para todo fluxo não configurado, que é pior que não responder.
 */
export function suggestedStartIso(dueIso: string, totalHoras: number | null): string {
  if (!totalHoras || totalHoras <= 0) return "";
  return startForWorkingDays(dueIso, horasParaDiasUteis(totalHoras));
}
