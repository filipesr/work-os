import { mondayOfWeek, shiftWeek, todayInSaoPaulo, formatISODate } from "@/lib/dates";

// Janela semanal do planejamento. Puro e testável: é a régua que decide o que a
// tela mostra, e ela precisa ser estável DENTRO da semana — quem abre na quarta
// tem que ver exatamente o mesmo recorte de quem abriu na segunda. Por isso tudo
// é ancorado na segunda-feira, nunca em "hoje".

export const WEEK_WINDOW_OPTIONS = [8, 12] as const;
export type WeekWindow = (typeof WEEK_WINDOW_OPTIONS)[number];
export const DEFAULT_WEEK_WINDOW: WeekWindow = 12;

export interface WeekSlot {
  /** Segunda-feira da semana (meia-noite UTC representando o dia em SP). */
  start: Date;
  /** Domingo da mesma semana. */
  end: Date;
  /** Chave estável para agrupar e para usar como key de render. */
  key: string; // YYYY-MM-DD da segunda
}

/** `?weeks=` → 8 ou 12. Qualquer outra coisa cai no padrão. */
export function parseWeekWindow(value: string | string[] | undefined): WeekWindow {
  const single = Array.isArray(value) ? value[0] : value;
  const n = Number(single);
  return (WEEK_WINDOW_OPTIONS as readonly number[]).includes(n)
    ? (n as WeekWindow)
    : DEFAULT_WEEK_WINDOW;
}

/**
 * As `count` semanas a partir da segunda-feira da semana corrente.
 *
 * Começa na segunda DESTA semana (não na próxima): a semana em curso ainda tem
 * dias úteis pela frente e é onde a ação é mais urgente.
 */
export function weekSlots(count: number, today: Date = todayInSaoPaulo()): WeekSlot[] {
  const first = mondayOfWeek(today);
  return Array.from({ length: count }, (_, i) => {
    const start = shiftWeek(first, i);
    const end = new Date(start.getTime() + 6 * 8.64e7);
    return { start, end, key: formatISODate(start) };
  });
}

/** Início e fim da janela inteira — o intervalo das queries. */
export function windowRange(slots: WeekSlot[]): { start: Date; end: Date } {
  const start = slots[0].start;
  const last = slots[slots.length - 1];
  // +1 dia menos 1ms: o fim do domingo, para pegar tudo que vence naquele dia.
  const end = new Date(last.end.getTime() + 8.64e7 - 1);
  return { start, end };
}

/** Em que semana da janela cai uma data. -1 quando está fora. */
export function weekIndexOf(slots: WeekSlot[], date: Date): number {
  const ms = date.getTime();
  return slots.findIndex((s) => ms >= s.start.getTime() && ms < s.end.getTime() + 8.64e7);
}
