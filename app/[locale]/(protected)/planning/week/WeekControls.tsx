"use client";

import { PeriodNavigator } from "@/components/planning/period/PeriodNavigator";

/**
 * A navegação de período da mesa do gestor.
 *
 * É o MESMO controle do calendário (`components/planning/period/`), e não uma navegação própria:
 * setas com o período entre elas, o rótulo abrindo o seletor, e o mesmo retorno de carregamento —
 * o destino aparece apagado no instante do clique e acende quando a grade chega.
 *
 * Antes eram só duas setas: sem rótulo entre elas, saber em que semana se estava exigia ler o
 * subtítulo do cabeçalho, e pular três semanas para a frente custava três cliques e três esperas.
 * O filtro de equipes que morava aqui foi para o diálogo de filtros.
 */
export function WeekControls({
  monday,
  isCurrentWeek,
  label,
}: {
  monday: Date;
  isCurrentWeek: boolean;
  /** O rótulo do período, montado no servidor por `lib/calendar/period-label.ts`. */
  label: string;
}) {
  return <PeriodNavigator view="week" anchor={monday} label={label} isCurrent={isCurrentWeek} />;
}
