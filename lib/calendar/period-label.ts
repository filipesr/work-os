import { weekRangeFromMonday } from "@/lib/dates";

/**
 * O rótulo do período que a barra do calendário mostra: `Setembro de 2026` no mês, `07 – 13 de
 * set.` na semana.
 *
 * Mora aqui porque agora tem DOIS donos. O servidor monta o rótulo do período que está sendo
 * exibido; o cliente monta o do período de DESTINO, para poder mostrá-lo apagado durante a
 * navegação em vez de deixar o anterior no lugar. Duas cópias divergiriam no primeiro ajuste de
 * formato, e a barra passaria a dizer uma coisa parada e outra carregando.
 *
 * **Sempre em UTC.** As datas do planejamento são meia-noite UTC representando o dia no calendário
 * de São Paulo (convenção de `lib/dates.ts`). Formatar sem `timeZone` devolve o dia ANTERIOR em
 * qualquer máquina a oeste de Greenwich: a semana de 07/09 aparecia como "06 – 13 de set." para
 * quem abre a tela no Brasil — o início um dia atrás, o fim certo.
 */
export function periodLabel(view: "week" | "month", anchor: Date, locale: string): string {
  if (view === "month") {
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(anchor);
  }

  const { start, end } = weekRangeFromMonday(anchor);
  const fmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}
