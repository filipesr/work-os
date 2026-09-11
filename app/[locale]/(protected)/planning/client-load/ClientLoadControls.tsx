"use client";

import { PeriodNavigator } from "@/components/planning/period/PeriodNavigator";

/**
 * A navegação de período da carga por cliente — o mesmo controle do calendário e da mesa do gestor
 * (`components/planning/period/`). Ver `WeekControls` para o porquê de não ser uma navegação
 * própria.
 */
export function ClientLoadControls({
  monday,
  isCurrentWeek,
  label,
}: {
  monday: Date;
  isCurrentWeek: boolean;
  label: string;
}) {
  return <PeriodNavigator view="week" anchor={monday} label={label} isCurrent={isCurrentWeek} />;
}
