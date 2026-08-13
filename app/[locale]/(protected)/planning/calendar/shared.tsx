import prisma from "@/lib/prisma";
import { getProjectsForSelect, getTemplatesForSelect } from "@/lib/actions/task";
import { getClients } from "@/lib/actions/client";
import { CalendarViewToggle } from "./CalendarViewToggle";
import { PeriodNavigator } from "./PeriodNavigator";
import { PlanningModeToggle } from "./PlanningModeToggle";

/**
 * Peças comuns às duas telas de calendário (semana e mês).
 *
 * As visões são rotas separadas, mas a barra de controle é UMA só de propósito.
 * Quando o mês tinha a sua própria, ela montava as URLs do zero e descartava
 * time/projeto/pessoa/concluídas a cada clique de período — o gestor filtrava e
 * perdia o filtro ao navegar. Este arquivo existe para que a separação de telas
 * não recrie aquela duplicação.
 */

/** Parâmetros de URL aceitos pelas duas visões. */
export interface CalendarSearchParams {
  week?: string;
  month?: string;
  team?: string;
  project?: string;
  user?: string;
  showCompleted?: string;
  plan?: string;
}

/** Opções de time/projeto/pessoa da barra de filtros. A lista de pessoas segue o
 *  time selecionado; se o time mudar e a pessoa não pertencer mais a ele, a
 *  seleção é descartada em vez de filtrar por alguém invisível no seletor. */
export async function loadFilterOptions(teamId?: string, selectedUserId?: string) {
  const [teams, projects, users] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: teamId ? { teams: { some: { id: teamId } } } : undefined,
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
  ]);
  const userOptions = users.map((u) => ({ id: u.id, name: u.name ?? u.email ?? u.id }));
  const validUserId =
    selectedUserId && userOptions.some((u) => u.id === selectedUserId) ? selectedUserId : undefined;
  return { teams, projects, userOptions, validUserId };
}

/** Cliente/projeto/template do diálogo de criação em lote. */
export async function loadCreateOptions() {
  const [rawProjects, rawTemplates, clients] = await Promise.all([
    getProjectsForSelect(),
    getTemplatesForSelect(),
    getClients(),
  ]);
  return {
    clients,
    projects: rawProjects.map((p) => ({
      id: p.id,
      name: p.name,
      clientId: p.clientId,
      clientName: p.client.name,
    })),
    templates: rawTemplates.map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      totalDurationHours: sumStageHours(tpl.stages),
    })),
  };
}

/**
 * Soma as previsões das etapas — ou null se QUALQUER uma estiver sem número.
 *
 * O tudo-ou-nada é o ponto: somar só as preenchidas devolveria um total menor que
 * o real, e o início sugerido cairia mais tarde do que o fluxo aguenta. Um número
 * errado aqui é pior que nenhum, porque o gestor confia nele. A previsão passou a
 * ser obrigatória no cadastro de etapa, então isto cobre os fluxos criados antes.
 */
export function sumStageHours(stages: { expectedDurationHours: number | null }[]): number | null {
  if (stages.length === 0) return null;
  let total = 0;
  for (const s of stages) {
    if (s.expectedDurationHours == null) return null;
    total += s.expectedDurationHours;
  }
  return total;
}

export type CreateOptions = Awaited<ReturnType<typeof loadCreateOptions>>;

/** Conjunto vazio, para quando a trava de planejamento está desligada e o
 *  diálogo de criação não pode abrir: evita três consultas por render sem mudar
 *  o contrato dos componentes, que esperam as listas sempre presentes. */
export const NO_CREATE_OPTIONS: CreateOptions = { clients: [], projects: [], templates: [] };

// A barra de controle é IDÊNTICA nas duas visões: alternância, navegação de
// período, trava de planejamento e filtros.
export function ControlBar({
  view,
  anchor,
  periodLabel,
  planning,
  filters,
}: {
  view: "week" | "month";
  anchor: Date;
  periodLabel: string;
  planning: boolean;
  filters: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 overflow-x-auto rounded-xl border border-border bg-card p-3 shadow-sm">
      <CalendarViewToggle view={view} />
      <PeriodNavigator view={view} anchor={anchor} label={periodLabel} />
      <div className="ml-auto flex items-center gap-3">
        {filters}
        <PlanningModeToggle enabled={planning} />
      </div>
    </div>
  );
}
