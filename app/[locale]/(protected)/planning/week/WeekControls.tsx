"use client";

import { useTranslations } from "next-intl";
import { WeekNav } from "@/components/shared/WeekNav";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

/** A mesa do gestor: navegação de semana (compartilhada) mais o filtro de time, que só existe aqui. */
export function WeekControls({
  monday,
  isCurrentWeek,
  teams,
  teamId,
}: {
  monday: Date;
  isCurrentWeek: boolean;
  teams: { id: string; name: string }[];
  teamId?: string;
}) {
  const t = useTranslations("planning.week");
  const { setParam } = useUrlFilters({ replace: true });

  return (
    <WeekNav
      monday={monday}
      isCurrentWeek={isCurrentWeek}
      labels={{ previous: t("previousWeek"), next: t("nextWeek"), current: t("currentWeek") }}
    >
      <select
        value={teamId ?? ""}
        onChange={(e) => setParam("team", e.target.value || null)}
        aria-label={t("teamFilter")}
        className="h-9 rounded-lg border border-input-border bg-input px-2 text-sm text-foreground"
      >
        <option value="">{t("allTeams")}</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </WeekNav>
  );
}
