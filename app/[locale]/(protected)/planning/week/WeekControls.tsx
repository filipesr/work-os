"use client";

import { useTranslations } from "next-intl";
import { WeekNav } from "@/components/shared/WeekNav";

/**
 * A navegação de semana da mesa do gestor.
 *
 * O filtro de equipes morava aqui, num menu próprio ao lado da navegação. Ele foi para o diálogo de
 * filtros (`components/planning/PlanningFilters.tsx`), junto com pessoas e concluídas, por dois
 * motivos: dois controles de recorte em lugares diferentes obrigam a procurar em qual deles está o
 * que se quer mudar, e o menu aplicava a cada clique — escolher três equipes recarregava a grade
 * três vezes, e as duas primeiras mostravam um recorte que ninguém pediu.
 */
export function WeekControls({ monday, isCurrentWeek }: { monday: Date; isCurrentWeek: boolean }) {
  const t = useTranslations("planning.week");

  return (
    <WeekNav
      monday={monday}
      isCurrentWeek={isCurrentWeek}
      labels={{ previous: t("previousWeek"), next: t("nextWeek"), current: t("currentWeek") }}
    />
  );
}
