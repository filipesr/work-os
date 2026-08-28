/**
 * Date helpers para Calendar + Team Productivity reports.
 *
 * Convenção interna: uma "SP-local Date" é um Date cujos campos getUTC* refletem
 * o ano/mês/dia/hora de São Paulo. Pra construir uma a partir de "agora",
 * use todayInSaoPaulo() ou nowInSaoPaulo(). Pra construir a partir de uma
 * string YYYY-MM-DD, use parseWeekParam() — o resultado já é SP-local.
 *
 * Premissas:
 * - Brasil está fixo em UTC-03:00 desde 2019 (sem DST).
 * - Se o BR reintroduzir DST, trocar SP_OFFSET_MS por Intl.DateTimeFormat com
 *   timeZone: 'America/Sao_Paulo'.
 */

const SP_OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "Now" as a SP-local Date (UTC fields hold SP calendar). */
export function nowInSaoPaulo(ref: Date = new Date()): Date {
  return new Date(ref.getTime() + SP_OFFSET_MS);
}

/** "Today" SP-local at midnight (Y/M/D in UTC fields == SP calendar). */
export function todayInSaoPaulo(ref: Date = new Date()): Date {
  const sp = nowInSaoPaulo(ref);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate()));
}

/**
 * Monday of the calendar week containing `day`. Reads getUTCDay directly —
 * caller is responsible for passing a Date whose UTC fields encode the SP
 * calendar (or whose UTC fields ARE the calendar of interest).
 */
export function mondayOfWeek(day: Date = todayInSaoPaulo()): Date {
  const dow = day.getUTCDay(); // 0=Sun..6=Sat
  const daysFromMonday = (dow + 6) % 7;
  return new Date(day.getTime() - daysFromMonday * DAY_MS);
}

/**
 * Parses ?week=YYYY-MM-DD into the Monday of that week.
 * The input is treated as a SP-local calendar date; the returned Date
 * keeps the SP-local-at-midnight invariant.
 */
export function parseWeekParam(value: string | string[] | undefined): Date {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return mondayOfWeek();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return mondayOfWeek();
  const [, y, m, d] = match;
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(day.getTime())) return mondayOfWeek();
  return mondayOfWeek(day);
}

export interface WeekRange {
  start: Date; // Monday 00:00 (SP-local repr)
  end: Date; // last millisecond before next Monday
  days: Date[]; // 7 entries, each at SP-local midnight
}

export function weekRangeFromMonday(monday: Date): WeekRange {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(monday.getTime() + i * DAY_MS));
  }
  const end = new Date(monday.getTime() + 7 * DAY_MS - 1);
  return { start: monday, end, days };
}

/** Whole-day delta between SP calendar days. Negative = target in past. */
export function daysUntil(target: Date, ref: Date = new Date()): number {
  const t = todayInSaoPaulo(target);
  const r = todayInSaoPaulo(ref);
  return Math.round((t.getTime() - r.getTime()) / DAY_MS);
}

/** YYYY-MM-DD from a Date's UTC fields (callers pass SP-local Dates). */
export function formatISODate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Shifts a SP-local Monday by N weeks. */
export function shiftWeek(monday: Date, deltaWeeks: number): Date {
  return new Date(monday.getTime() + deltaWeeks * 7 * DAY_MS);
}

/** First day (midnight, SP-local repr) of the month containing `day`. */
export function firstOfMonth(day: Date = todayInSaoPaulo()): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

/** Parses ?month=YYYY-MM into the first day of that month (SP-local). */
export function parseMonthParam(value: string | string[] | undefined): Date {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return firstOfMonth();
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return firstOfMonth();
  const [, y, m] = match;
  const first = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  if (Number.isNaN(first.getTime())) return firstOfMonth();
  return first;
}

export interface MonthRange {
  first: Date; // first of month 00:00 (SP-local repr)
  daysInMonth: number;
  gridStart: Date; // Monday on/before the 1st
  gridEnd: Date; // last millisecond of the 42-day grid
  gridDays: Date[]; // 42 entries (6 weeks), Monday-first, each at SP-local midnight
}

/** Builds a 6-week (42-day) Monday-first grid covering the month of `first`. */
export function monthRangeFromFirst(first: Date): MonthRange {
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const gridStart = mondayOfWeek(first);
  const gridDays: Date[] = [];
  for (let i = 0; i < 42; i++) {
    gridDays.push(new Date(gridStart.getTime() + i * DAY_MS));
  }
  const gridEnd = new Date(gridStart.getTime() + 42 * DAY_MS - 1);
  return { first, daysInMonth, gridStart, gridEnd, gridDays };
}

/** Shifts a SP-local first-of-month by N months. */
export function shiftMonth(first: Date, deltaMonths: number): Date {
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + deltaMonths, 1));
}

/** SP-local date → "YYYY-MM" (a chave de mês usada na URL do calendário). */
export function formatYearMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Current SP-local month as "YYYY-MM". */
export function currentMonthSaoPaulo(ref: Date = new Date()): string {
  return formatISODate(nowInSaoPaulo(ref)).slice(0, 7);
}

/** Localized "month year" label for a "YYYY-MM" value (e.g. "junho de 2026"). */
export function formatMonthLabel(ym: string, locale: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** The SP-local month ("YYYY-MM") that contains the real instant `instant`. */
export function monthKeySaoPaulo(instant: Date): string {
  return formatISODate(nowInSaoPaulo(instant)).slice(0, 7);
}

/** Instante real (UTC) equivalente a uma SP-local Date. Use ao filtrar COLUNA DE TIMESTAMP gravada
 *  com `new Date()` — `completedAt`, `createdAt` —, que guarda instante de verdade, e não a
 *  representação SP-local que `plannedDate` usa. Comparar as duas convenções erra em três horas,
 *  e o erro só aparece na borda do dia: some trabalho concluído à noite. */
export function realInstant(spLocal: Date): Date {
  return new Date(spLocal.getTime() - SP_OFFSET_MS);
}

/**
 * Real UTC [start, end] instants covering the SP-local month "YYYY-MM"
 * (e.g. "2026-06" → 2026-06-01T03:00:00Z … 2026-07-01T02:59:59.999Z).
 * Suitable for filtering timestamp columns by a São Paulo calendar month.
 */
export function monthRangeSaoPaulo(monthStr: string): { start: Date; end: Date } {
  const first = parseMonthParam(monthStr); // SP-local first-of-month (UTC fields = SP calendar)
  const next = shiftMonth(first, 1);
  // A SP-local Date's fields are the SP calendar; the real instant is field-time − SP_OFFSET.
  return {
    start: new Date(first.getTime() - SP_OFFSET_MS),
    end: new Date(next.getTime() - SP_OFFSET_MS - 1),
  };
}

// ---------------------------------------------------------------------------
// Formatação de exibição (pt-BR) — fonte única para o `formatDate` inline que
// era reimplementado em tabelas/modais (my-stages, dashboard, calendar, admin).
// ---------------------------------------------------------------------------

/** dd/mm/aaaa em pt-BR. Aceita Date, string ISO, null/undefined. */
export function formatDisplayDate(date: Date | string | null | undefined, fallback = "-"): string {
  if (!date) return fallback;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** dd/mm/aaaa HH:mm em pt-BR. */
export function formatDisplayDateTime(
  date: Date | string | null | undefined,
  fallback = "-"
): string {
  if (!date) return fallback;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** HH:mm de São Paulo. Existe para a hora do COMPROMISSO marcado (a locação é às 14h): ler esse
 *  horário no fuso do servidor — que em produção não é o do escritório — seria remarcar em cima de
 *  um número errado. `formatDisplayDateTime` é anterior a esta preocupação e ficou como está. */
export function formatDisplayTime(date: Date | string | null | undefined, fallback = "-"): string {
  if (!date) return fallback;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export type DueState = "overdue" | "dueSoon" | "none";

/**
 * Classifica uma data de vencimento: `overdue` (vencida), `dueSoon` (vence em
 * menos de 2 dias) ou `none`. Substitui o cálculo inline duplicado em
 * MyStagesTable e ActiveStagesWidget.
 */
export function getDueState(
  dueDate: Date | string | null | undefined,
  ref: Date = new Date()
): DueState {
  if (!dueDate) return "none";
  const d = typeof dueDate === "string" ? new Date(dueDate) : dueDate;
  if (Number.isNaN(d.getTime())) return "none";
  const diff = d.getTime() - ref.getTime();
  if (diff < 0) return "overdue";
  if (diff < 2 * DAY_MS) return "dueSoon";
  return "none";
}
