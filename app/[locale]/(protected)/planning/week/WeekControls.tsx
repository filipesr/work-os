"use client";

import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { WeekNav } from "@/components/shared/WeekNav";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { TEAM_PARAM_ALL, type TeamFilterMode } from "@/lib/planning/team-filter";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** A mesa do gestor: navegação de semana (compartilhada) mais o filtro de equipes, que só existe
 *  aqui e é MÚLTIPLO — a mesa distribui produção, e abri-la com RH e Coordenação no meio da grade
 *  obriga o gestor a filtrar na cabeça toda vez. Ver `lib/planning/team-filter.ts` para os três
 *  estados e o porquê de cada um. */
export function WeekControls({
  monday,
  isCurrentWeek,
  teams,
  mode,
  selectedIds,
}: {
  monday: Date;
  isCurrentWeek: boolean;
  teams: { id: string; name: string }[];
  /** O estado LIDO da URL: padrão, todas, ou uma escolha explícita. */
  mode: TeamFilterMode;
  /** O recorte EFETIVO, já resolvido no servidor. É ele que marca as caixas: o que está marcado
   *  tem de ser exatamente o que a grade ao lado está mostrando. */
  selectedIds: string[];
}) {
  const t = useTranslations("planning.week");
  const { setParam } = useUrlFilters({ replace: true });

  const marcar = (id: string) => {
    const proximo = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    // Desmarcar o último volta ao PADRÃO em vez de deixar a grade em branco — "vazio" já é o
    // padrão, e uma semana inteira escondida por um clique a mais seria trabalho sumindo de vista.
    setParam("team", proximo.length > 0 ? proximo.join(",") : null);
  };

  const rotulo =
    mode === "default"
      ? t("teamsDefault")
      : mode === "all"
        ? t("teamsAll")
        : t("teamsCount", { count: selectedIds.length });

  return (
    <WeekNav
      monday={monday}
      isCurrentWeek={isCurrentWeek}
      labels={{ previous: t("previousWeek"), next: t("nextWeek"), current: t("currentWeek") }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${t("teamFilter")}: ${rotulo}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input-border bg-input px-2 text-sm text-foreground"
        >
          {rotulo}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
          {/* Os dois modos primeiro, separados das equipes: eles respondem "que recorte?", e a
              lista abaixo responde "quais?". Misturá-los faria o padrão parecer mais uma caixa. */}
          <DropdownMenuItem onSelect={() => setParam("team", null)}>
            {/* Rótulo e dica empilhados: lado a lado, a dica disputa a largura do menu e quebra a
                linha no meio do nome da opção. */}
            <span className="flex flex-col">
              <span>{t("teamsDefault")}</span>
              <span className="text-xs text-muted-foreground">{t("teamsDefaultHint")}</span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setParam("team", TEAM_PARAM_ALL)}>
            {t("teamsAll")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {teams.map((team) => (
            <DropdownMenuCheckboxItem
              key={team.id}
              checked={selectedIds.includes(team.id)}
              // Sem isto o menu fecha a cada clique, e escolher três equipes vira três aberturas.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => marcar(team.id)}
            >
              {team.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </WeekNav>
  );
}
