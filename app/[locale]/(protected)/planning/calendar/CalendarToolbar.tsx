"use client";

import { useTranslations } from "next-intl";
import { PlanningFilters, type PlanningFilterField } from "@/components/planning/PlanningFilters";
import { PeriodNavigator } from "./PeriodNavigator";
import { PlanningModeToggle } from "./PlanningModeToggle";

interface Option {
  id: string;
  name: string;
}

const KINDS = ["HOLIDAY", "COMMERCIAL", "EVENT"] as const;
const COUNTRIES = ["AR", "BR", "PY"] as const;

export interface CalendarFilterSelection {
  teamId?: string;
  projectId?: string;
  userId?: string;
  showCompleted: boolean;
  /** Recorte das DATAS do calendário (feriados, comemorativas, eventos próprios). Só a visão
   *  mensal mostra datas, então estes dois só aparecem lá — oferecê-los na semana seria um
   *  controle que não faz nada. */
  dateKind?: string;
  country?: string;
}

/**
 * Barra única do calendário: filtros à esquerda, navegação ao CENTRO, ações à direita.
 *
 * Antes eram duas linhas — alternador + navegação em cima, três selects abertos embaixo — e a
 * segunda ficava quase vazia, com a navegação desalinhada dela. Os três selects sempre expandidos
 * ocupavam a largura toda para dizer, na maior parte do tempo, "todos / todos / todos".
 *
 * Os filtros passaram a usar o diálogo compartilhado das telas de planejamento
 * (`components/planning/PlanningFilters.tsx`), que trouxe três coisas que esta barra não tinha: a
 * escolha só vale no **Aplicar** — antes cada select recarregava a grade sozinho, e montar um
 * recorte de três campos custava três recargas, das quais duas mostravam algo que ninguém pediu —,
 * o recorte **sobrevive ao recarregamento**, e o botão fica ao lado das próprias tags.
 *
 * As tags continuam FORA do diálogo, que é o que impede o filtro persistido de virar armadilha:
 * sem elas, abrir a tela recortada por uma escolha de semanas atrás parece dado que sumiu.
 */
export function CalendarToolbar({
  view,
  anchor,
  periodLabel,
  isCurrentPeriod,
  planning,
  teams,
  projects,
  users,
  selected,
}: {
  view: "week" | "month";
  anchor: Date;
  periodLabel: string;
  isCurrentPeriod: boolean;
  planning: boolean;
  teams: Option[];
  projects: Option[];
  users: Option[];
  selected: CalendarFilterSelection;
}) {
  const t = useTranslations("reportsCalendar.filters");

  const fields: PlanningFilterField[] = [
    {
      kind: "single",
      param: "team",
      label: t("team"),
      allLabel: t("allTeams"),
      options: teams,
      selected: selected.teamId,
      // Trocar a equipe limpa a pessoa: ela pode não pertencer à nova, e mantê-la filtraria por
      // alguém que nem aparece no seletor.
      clears: ["user"],
    },
    {
      kind: "single",
      param: "project",
      label: t("project"),
      allLabel: t("allProjects"),
      options: projects,
      selected: selected.projectId,
    },
    {
      kind: "single",
      param: "user",
      label: t("user"),
      allLabel: t("allUsers"),
      options: users,
      selected: selected.userId,
    },
    // Só no mês: é a única visão que desenha as datas do calendário.
    ...(view === "month"
      ? ([
          {
            kind: "single",
            param: "dateKind",
            label: t("dateKind"),
            allLabel: t("allKinds"),
            options: KINDS.map((k) => ({ id: k, name: t(`kind.${k}`) })),
            selected: selected.dateKind,
          },
          {
            kind: "single",
            param: "country",
            label: t("country"),
            allLabel: t("allCountries"),
            options: COUNTRIES.map((c) => ({ id: c, name: c })),
            selected: selected.country,
          },
        ] as PlanningFilterField[])
      : []),
    {
      kind: "check",
      param: "showCompleted",
      label: t("showCompleted"),
      checked: selected.showCompleted,
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      {/* Três colunas de larguras iguais nas pontas: é o que mantém a navegação
          no centro ÓTICO mesmo com quantidades diferentes de tag à esquerda. */}
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <PlanningFilters
          scope={`calendar-${view}`}
          namespace="reportsCalendar.filters"
          fields={fields}
        />

        <div className="flex items-center justify-center gap-3">
          <PeriodNavigator
            view={view}
            anchor={anchor}
            label={periodLabel}
            isCurrent={isCurrentPeriod}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <PlanningModeToggle enabled={planning} />
        </div>
      </div>
    </div>
  );
}
