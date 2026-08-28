"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatISODate, shiftWeek } from "@/lib/dates";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";

/**
 * Navegar de semana e recortar por time, no `PageHeader` — mesmo lugar em que
 * `/planning/coverage` põe o seu toggle.
 *
 * Sem isto, a semana seguinte só era alcançável digitando `?week=` na URL — e a semana seguinte é
 * justamente onde se distribui trabalho: a corrente já está acontecendo. O recorte vive na URL
 * para ser compartilhável e sobreviver ao refresh.
 */
export function WeekControls({
  monday,
  isCurrentWeek,
  teams,
  teamId,
}: {
  /** Segunda da semana em tela. */
  monday: Date;
  /** Se a semana em tela é a de hoje. Vem do SERVIDOR: calcular `new Date()` aqui divergiria
   *  entre render de servidor e de cliente perto da virada do dia. */
  isCurrentWeek: boolean;
  teams: { id: string; name: string }[];
  teamId?: string;
}) {
  const t = useTranslations("planning.week");
  const searchParams = useSearchParams();
  const { setParam } = useUrlFilters({ replace: true });

  // A URL parte sempre dos parâmetros atuais: só a chave da semana muda, senão navegar descartaria
  // o filtro de time a cada clique.
  const href = (delta: number) => {
    const params = new URLSearchParams(searchParams.toString());
    // "Semana atual" = tirar a âncora e deixar o servidor cair na semana de hoje.
    if (delta === 0) params.delete("week");
    else params.set("week", formatISODate(shiftWeek(monday, delta)));
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  };

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="flex flex-wrap items-center gap-2">
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

      <div className="flex items-center gap-1">
        <Link href={href(-1)} aria-label={t("previousWeek")} className={iconBtn} rel="prev">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <Link href={href(1)} aria-label={t("nextWeek")} className={iconBtn} rel="next">
          <ChevronRight className="h-4 w-4" />
        </Link>
        {/* "Semana atual" só aparece quando LEVA a algum lugar: sempre visível, seria mais um botão
            a ignorar; aparecendo só fora da semana de hoje, a própria presença informa que você
            navegou para longe. */}
        {!isCurrentWeek && (
          <Link
            href={href(0)}
            scroll={false}
            className="ml-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
          >
            {t("currentWeek")}
          </Link>
        )}
      </div>
    </div>
  );
}
