/**
 * A demanda que ninguém pegou nem marcou.
 *
 * A carga por cliente responde "quanto deste cliente está distribuído nesta semana". O que NÃO está
 * distribuído não passa por nenhuma das portas dela — e o silêncio é indistinguível de "está tudo
 * certo". Cinco demandas paradas de um cliente é exatamente o que a tela deveria gritar.
 *
 * Puro e sem relógio do sistema: "hoje" chega por parâmetro. Dias ISO comparam-se como texto, o que
 * mantém o módulo livre de fuso.
 */

const DIA_MS = 86_400_000;

export type StalledStage = {
  /** Identifica a etapa escolhida — devolvida em `StalledCheck` para quem chama não recalcular a
   *  mesma derivação ("a próxima etapa") uma segunda vez em memória. Duas contas para a mesma
   *  coisa convergem hoje; amanhã podem divergir, e a falha seria silenciosa e partida. */
  stageId: string;
  order: number;
  status: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED";
  assigneeId: string | null;
  plannedDate: Date | null;
  /** Roteamento da demanda. */
  teamId: string | null;
  /** Padrão do modelo. */
  defaultTeamId: string | null;
};

export type StalledCheck =
  | { stalled: false }
  /** `teamId` é a equipe EFETIVA da próxima etapa; `null` na coringa que ninguém roteou.
   *  `stageId` é a etapa escolhida como "a próxima" — a mesma que decidiu `teamId`. */
  | { stalled: true; teamId: string | null; stageId: string };

/**
 * A demanda está parada quando a PRÓXIMA etapa — a não concluída de menor `order` — não tem dono e
 * não tem dia.
 *
 * A estreiteza é o ponto: uma etapa FUTURA sem dono é normal (ninguém pega a etapa 4 antes da 1), e
 * sinalizar isso acenderia a coluna em toda demanda saudável do sistema.
 */
export function checkStalled(stages: StalledStage[]): StalledCheck {
  let proxima: StalledStage | null = null;
  for (const s of stages) {
    if (s.status === "COMPLETED") continue;
    if (!proxima || s.order < proxima.order) proxima = s;
  }
  // Sem etapa por concluir: é a demanda entregue, e ela já aparece na grade pelo dia em que fechou.
  if (!proxima) return { stalled: false };
  if (proxima.assigneeId || proxima.plannedDate) return { stalled: false };
  // Roteamento da demanda substitui o padrão do modelo — a regra de `lib/stage-team.ts`.
  return {
    stalled: true,
    teamId: proxima.teamId ?? proxima.defaultTeamId,
    stageId: proxima.stageId,
  };
}

/**
 * Desde quando ninguém toca na demanda.
 *
 * Os dois fatos são necessários: sem a LIBERAÇÃO não há marco inicial para a demanda que nunca
 * andou; sem o APONTAMENTO, uma demanda que alguém pegou, trabalhou e largou ontem contaria desde a
 * liberação original e diria "parado há 40 dias" sobre trabalho de um dia atrás.
 *
 * Sem nenhum dos dois — dado antigo, sem transição registrada — vale a criação: é o piso honesto,
 * porque a demanda existe desde então e não andou.
 */
export function stalledSince(args: {
  releasedISO: string | null;
  lastLogISO: string | null;
  createdISO: string;
}): string {
  const candidatos = [args.releasedISO, args.lastLogISO].filter((d): d is string => !!d);
  if (candidatos.length === 0) return args.createdISO;
  return candidatos.reduce((a, b) => (a > b ? a : b));
}

/** Dias corridos, nunca negativo: "parado há -3 dias" não significa nada. */
export function idleDays(sinceISO: string, todayISO: string): number {
  const dias = Math.round(
    (Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${sinceISO}T00:00:00Z`)) / DIA_MS
  );
  return dias > 0 ? dias : 0;
}

export type StalledItem = {
  taskId: string;
  taskTitle: string;
  projectName: string;
  dueDateISO: string | null;
  overdue: boolean;
  /** A próxima etapa não tem equipe efetiva: ninguém PODE pegar, o gestor precisa rotear. */
  noTeam: boolean;
  idleDays: number;
  /** Referência das etapas por concluir — estimativa, e a tela marca como tal. */
  hours: number;
};

/**
 * A ordem é a urgência: com prazo primeiro, por prazo crescente; sem prazo por último, e entre elas
 * a mais parada primeiro.
 *
 * Não há ramo para "vencida": a data dela é a mais antiga de todas, então ela sobe sozinha. Um ramo
 * a mais seria uma regra a mais para divergir da primeira.
 *
 * Devolve uma cópia — ordenar no lugar mudaria o array de quem chamou.
 */
export function sortStalled(items: StalledItem[]): StalledItem[] {
  return [...items].sort((a, b) => {
    if (a.dueDateISO && b.dueDateISO) {
      return a.dueDateISO.localeCompare(b.dueDateISO) || a.taskTitle.localeCompare(b.taskTitle);
    }
    if (a.dueDateISO) return -1;
    if (b.dueDateISO) return 1;
    // Sem prazo dos dois lados: a mais parada primeiro.
    return b.idleDays - a.idleDays || a.taskTitle.localeCompare(b.taskTitle);
  });
}
