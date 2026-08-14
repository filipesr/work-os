"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useUrlFilters } from "@/lib/hooks/useUrlFilters";
import { PeriodNavigator } from "./PeriodNavigator";
import { PlanningModeToggle } from "./PlanningModeToggle";

interface Option {
  id: string;
  name: string;
}

export interface CalendarFilterSelection {
  teamId?: string;
  projectId?: string;
  userId?: string;
  showCompleted: boolean;
}

/**
 * Barra única do calendário: navegação ao CENTRO, ações à direita.
 *
 * Antes eram duas linhas — alternador + navegação em cima, três selects abertos
 * embaixo — e a segunda ficava quase vazia, com a navegação desalinhada dela. Os
 * três selects sempre expandidos ocupavam a largura toda para dizer, na maior
 * parte do tempo, "todos / todos / todos".
 *
 * Os filtros foram para um diálogo. O RISCO disso é esconder que há filtro
 * ativo: dá para olhar uma semana recortada achando que é a semana inteira. Por
 * isso o botão carrega a contagem e cada filtro ativo aparece como tag removível
 * à esquerda — o que está ligado continua na cara, só o que está desligado sai
 * do caminho.
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
  const { setParam, setParams } = useUrlFilters({ replace: true });
  const [open, setOpen] = useState(false);

  const update = (key: string, value: string) => {
    // Trocar o time também limpa a pessoa, que pode não pertencer mais a ele.
    if (key === "team") setParams({ team: value, user: null });
    else setParam(key, value);
  };

  const nomeDe = (lista: Option[], id?: string) => lista.find((o) => o.id === id)?.name;

  // Cada tag ativa: o que remover e como chamar. `showCompleted` entra aqui
  // porque também recorta o que a grade mostra — é filtro, ainda que seja botão.
  const ativos = [
    { chave: "team", rotulo: nomeDe(teams, selected.teamId), limpar: () => update("team", "") },
    {
      chave: "project",
      rotulo: nomeDe(projects, selected.projectId),
      limpar: () => setParam("project", null),
    },
    { chave: "user", rotulo: nomeDe(users, selected.userId), limpar: () => setParam("user", null) },
    {
      chave: "showCompleted",
      rotulo: selected.showCompleted ? t("showCompleted") : undefined,
      limpar: () => setParam("showCompleted", null),
    },
  ].filter((f) => f.rotulo);

  const limparTudo = () =>
    setParams({ team: null, project: null, user: null, showCompleted: null });

  const selectClass =
    "h-10 w-full rounded-lg border-2 border-input-border bg-input px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 transition-colors";

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      {/* Três colunas de larguras iguais nas pontas: é o que mantém a navegação
          no centro ÓTICO mesmo com quantidades diferentes de tag à esquerda. */}
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-wrap items-center gap-1.5">
          {ativos.map((f) => (
            <button
              key={f.chave}
              type="button"
              onClick={f.limpar}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
              aria-label={t("clearOne", { filter: f.rotulo as string })}
            >
              {f.rotulo}
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-3">
          <PeriodNavigator
            view={view}
            anchor={anchor}
            label={periodLabel}
            isCurrent={isCurrentPeriod}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {t("title")}
                {ativos.length > 0 && (
                  <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                    {ativos.length}
                  </span>
                )}
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>{t("title")}</DialogTitle>
                <DialogDescription>{t("subtitle")}</DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-1">
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-muted-foreground">
                    {t("team")}
                  </span>
                  <select
                    className={selectClass}
                    value={selected.teamId ?? ""}
                    onChange={(e) => update("team", e.target.value)}
                  >
                    <option value="">{t("allTeams")}</option>
                    {teams.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-muted-foreground">
                    {t("project")}
                  </span>
                  <select
                    className={selectClass}
                    value={selected.projectId ?? ""}
                    onChange={(e) => update("project", e.target.value)}
                  >
                    <option value="">{t("allProjects")}</option>
                    {projects.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-muted-foreground">
                    {t("user")}
                  </span>
                  <select
                    className={selectClass}
                    value={selected.userId ?? ""}
                    onChange={(e) => update("user", e.target.value)}
                  >
                    <option value="">{t("allUsers")}</option>
                    {users.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 pt-1 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={selected.showCompleted}
                    onChange={() => setParam("showCompleted", selected.showCompleted ? null : "1")}
                  />
                  {t("showCompleted")}
                </label>
              </div>

              {ativos.length > 0 && (
                <button
                  type="button"
                  onClick={limparTudo}
                  className="self-start text-xs font-medium text-primary hover:underline"
                >
                  {t("clearAll")}
                </button>
              )}
            </DialogContent>
          </Dialog>

          <PlanningModeToggle enabled={planning} />
        </div>
      </div>
    </div>
  );
}
