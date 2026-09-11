"use client";

import { useTranslations } from "next-intl";
import { WeekNav } from "@/components/shared/WeekNav";

/**
 * A navegação de semana da carga por cliente.
 *
 * O select de equipe morava aqui, solto ao lado da navegação, e foi para o diálogo de filtros
 * (`components/planning/PlanningFilters.tsx`) junto com o recorte de cliente: dois controles de
 * recorte em lugares diferentes obrigam a procurar em qual deles está o que se quer mudar — e o
 * select aplicava a cada troca, sem chance de montar o recorte antes de a grade recarregar.
 */
export function ClientLoadControls({
  monday,
  isCurrentWeek,
}: {
  monday: Date;
  isCurrentWeek: boolean;
}) {
  const t = useTranslations("planning.clientLoad");

  return (
    <WeekNav
      monday={monday}
      isCurrentWeek={isCurrentWeek}
      labels={{ previous: t("previousWeek"), next: t("nextWeek"), current: t("currentWeek") }}
    />
  );
}
