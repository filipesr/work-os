"use client";

import { useTranslations } from "next-intl";
import { WeekNav } from "@/components/shared/WeekNav";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

/**
 * Navegação de semana (compartilhada) mais o filtro de time da carga por cliente.
 *
 * É o mesmo controle da mesa do gestor (`planning/week/WeekControls.tsx`), com os rótulos do
 * namespace desta tela: as duas respondem sobre a MESMA semana e precisam do mesmo recorte, senão
 * o gestor compara a carga de um cliente com uma mesa filtrada por outro conjunto de gente.
 */
export function ClientLoadControls({
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
  const t = useTranslations("planning.clientLoad");
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
