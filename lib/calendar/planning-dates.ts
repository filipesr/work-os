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

/**
 * Início sugerido: o prazo menos o tempo que o fluxo inteiro consome.
 *
 * `totalHoras` é a soma de `expectedDurationHours` das etapas do template — o
 * mesmo número que hoje serve de SLA por etapa, agora somado para responder
 * "quando isto precisa começar?". Convertido em dias CORRIDOS, não úteis: a
 * conta é de calendário, e tratar fim de semana exigiria feriado por país, que o
 * app tem mas por outra via (CalendarOccurrence) e para outro fim.
 *
 * Devolve "" quando não há duração configurada — sem isso a conta produziria
 * "comece hoje" para todo fluxo não configurado, que é pior que não responder.
 */
export function suggestedStartIso(dueIso: string, totalHoras: number | null): string {
  if (!totalHoras || totalHoras <= 0) return "";
  const dias = Math.ceil(totalHoras / 24);
  return subtractDays(dueIso, dias);
}
