"use server";

import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";
import { formatISODate, nowInSaoPaulo, realInstant, todayInSaoPaulo } from "@/lib/dates";
import { buildTimelineRows, type TimelineRow } from "@/lib/planning/timeline-rows";
import { projectDemandDays, type ProjectionStage } from "@/lib/planning/demand-projection";
import { getStageReferences } from "@/lib/planning/stage-reference";

/**
 * A história do projeto: o que já foi feito, o que está em curso e o que vem.
 *
 * Substitui o kanban, que respondia uma pergunta só — onde cada demanda está agora — e jogava o
 * tempo fora. Quanto uma demanda ficou parada, onde o esforço foi e quando cada coisa andou não
 * existiam em tela nenhuma.
 *
 * O eixo é a DEMANDA, nunca a pessoa: uma linha do tempo por pessoa seria vigilância, e é o que a
 * biblioteca do projeto proíbe. Quem aparece na célula aparece como quem executou aquela etapa.
 *
 * O futuro sai da MESMA `projectDemandDays` da carga por cliente. Uma segunda projeção divergiria
 * da primeira, e a segunda seria a errada.
 */

/** Até onde a projeção vale. Além de oito semanas ela é ficção: a cadeia acumula incerteza a cada
 *  etapa, e uma tela que desenha três meses adiante promete o que ninguém pode cumprir.
 *
 *  NÃO exportar: arquivo `"use server"` só pode exportar função async. Um `export const` aqui passa
 *  no tsc E na suíte de testes, e quebra `next build` em runtime — já aconteceu neste projeto. */
const FUTURE_HORIZON_DAYS = 56;

export type TimelineLine = {
  stageId: string;
  stageOrder: number;
  stageName: string;
  assigneeName: string | null;
  hours: number;
  /** O número é referência, não medição — a tela marca com `~`. */
  estimated: boolean;
  state: "done" | "pending" | "waiting";
};

export type TimelineCell = { doneHours: number; pendingHours: number; lines: TimelineLine[] };

export type TimelineDemand = {
  taskId: string;
  title: string;
  open: boolean;
  dueDateISO: string | null;
  overdue: boolean;
};

export type TimelineFilters = {
  mine?: boolean;
  assigneeId?: string;
  teamId?: string;
  priority?: string;
};

export type ProjectTimeline = {
  rows: TimelineRow[];
  demands: TimelineDemand[];
  todayISO: string;
  /** dia → demanda → célula. */
  byDay: Record<string, Record<string, TimelineCell>>;
};

export async function getProjectTimeline(
  projectId: string,
  filters?: TimelineFilters
): Promise<ProjectTimeline> {
  const me = await getSessionUser();
  const hojeISO = formatISODate(todayInSaoPaulo());

  // "Minhas demandas" e "por responsável" olham o responsável da ETAPA. `Task.assigneeId` existe no
  // schema e NENHUM caminho do fluxo o escreve — filtrar por ele devolveria sempre vazio, que é
  // como o filtro do kanban antigo estava quebrado sem ninguém perceber.
  const donoProcurado = filters?.mine ? me.id : filters?.assigneeId;

  const tarefas = await prisma.task.findMany({
    where: {
      projectId,
      ...(filters?.priority ? { priority: filters.priority as never } : {}),
      ...(donoProcurado || filters?.teamId
        ? {
            activeStages: {
              some: {
                ...(donoProcurado ? { assigneeId: donoProcurado } : {}),
                ...(filters?.teamId
                  ? {
                      OR: [
                        { teamId: filters.teamId },
                        { teamId: null, stage: { defaultTeamId: filters.teamId } },
                      ],
                    }
                  : {}),
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      completedAt: true,
      dueDate: true,
      activeStages: {
        select: {
          id: true,
          stageId: true,
          status: true,
          plannedDate: true,
          completedAt: true,
          activatedAt: true,
          assignee: { select: { name: true, email: true } },
          team: { select: { name: true } },
          stage: {
            select: {
              name: true,
              order: true,
              defaultTeam: { select: { name: true } },
              // Os PRÉ-REQUISITOS vivem em `dependents` — em `TemplateStage` o campo de nome
              // intuitivo é a relação INVERSA. Ver o comentário no schema.
              dependents: { select: { dependsOnStageId: true } },
            },
          },
        },
        orderBy: [{ stage: { order: "asc" } }, { id: "asc" }],
      },
    },
  });

  const idsDasTarefas = tarefas.map((t) => t.id);
  const apontamentos = idsDasTarefas.length
    ? await prisma.timeLog.findMany({
        where: { taskId: { in: idsDasTarefas } },
        select: { taskId: true, stageId: true, hoursSpent: true, logDate: true },
      })
    : [];

  const referencias = await getStageReferences([
    ...new Set(tarefas.flatMap((t) => t.activeStages.map((a) => a.stageId))),
  ]);
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;
  const sourceDe = (stageId: string) => referencias.get(stageId)?.source ?? "declared";

  // (tarefa, etapa) → dia → horas, e (tarefa, etapa) → total para descontar da referência. Mapa
  // aninhado, e não chave concatenada: cada etapa lê só os SEUS dias, em vez de varrer a lista
  // inteira de apontamentos do projeto uma vez por etapa.
  const chave = (taskId: string, stageId: string) => `${taskId}::${stageId}`;
  const feitoPorDia = new Map<string, Map<string, number>>();
  const feitoPorEtapa = new Map<string, number>();
  for (const a of apontamentos) {
    if (!a.stageId) continue; // hora lançada na demanda inteira: não é de etapa nenhuma
    const k = chave(a.taskId, a.stageId);
    const dia = formatISODate(nowInSaoPaulo(a.logDate));
    const porDia = feitoPorDia.get(k) ?? new Map<string, number>();
    porDia.set(dia, (porDia.get(dia) ?? 0) + a.hoursSpent);
    feitoPorDia.set(k, porDia);
    feitoPorEtapa.set(k, (feitoPorEtapa.get(k) ?? 0) + a.hoursSpent);
  }

  // A janela do futuro, para a projeção. Ela devolve `null` para o que não cabe aqui — e o que não
  // cabe simplesmente não aparece, em vez de empilhar no último dia.
  const diasFuturos = Array.from({ length: FUTURE_HORIZON_DAYS + 1 }, (_, i) =>
    formatISODate(new Date(Date.parse(`${hojeISO}T00:00:00Z`) + i * 86_400_000))
  );

  const byDay: Record<string, Record<string, TimelineCell>> = {};
  const movedDays = new Set<string>();
  const ultimoMovimento = new Map<string, string>();

  const celula = (dia: string, taskId: string): TimelineCell => {
    byDay[dia] ??= {};
    byDay[dia][taskId] ??= { doneHours: 0, pendingHours: 0, lines: [] };
    return byDay[dia][taskId];
  };
  const marcarMovimento = (dia: string, taskId: string) => {
    movedDays.add(dia);
    const anterior = ultimoMovimento.get(taskId);
    if (!anterior || dia > anterior) ultimoMovimento.set(taskId, dia);
  };

  for (const t of tarefas) {
    // Criação e conclusão da demanda são movimento: é onde a história começa e termina.
    marcarMovimento(formatISODate(nowInSaoPaulo(t.createdAt)), t.id);
    if (t.completedAt) marcarMovimento(formatISODate(nowInSaoPaulo(t.completedAt)), t.id);

    const projecao = projectDemandDays({
      stages: t.activeStages.map(
        (a): ProjectionStage => ({
          id: a.id,
          stageId: a.stageId,
          order: a.stage.order,
          dependsOnIds: a.stage.dependents.map((d) => d.dependsOnStageId),
          status: a.status,
          plannedDate: a.plannedDate ? formatISODate(a.plannedDate) : null,
          completedDay: a.completedAt ? formatISODate(nowInSaoPaulo(a.completedAt)) : null,
          pendingHours: Math.max(
            0,
            horasDe(a.stageId) - (feitoPorEtapa.get(chave(t.id, a.stageId)) ?? 0)
          ),
        })
      ),
      days: diasFuturos,
      todayISO: hojeISO,
      dueDateISO: t.dueDate ? formatISODate(t.dueDate) : null,
    });

    for (const a of t.activeStages) {
      const nome =
        a.assignee?.name ?? a.assignee?.email ?? a.team?.name ?? a.stage.defaultTeam?.name ?? null;
      const referencia = horasDe(a.stageId);
      const pendente = Math.max(0, referencia - (feitoPorEtapa.get(chave(t.id, a.stageId)) ?? 0));

      // Liberar a etapa é movimento: é o dia em que o trabalho passou a ser possível. Sem isso, uma
      // demanda que andou pela cadeia sem ninguém apontar hora ficaria invisível na história.
      if (a.activatedAt) marcarMovimento(formatISODate(nowInSaoPaulo(a.activatedAt)), t.id);

      // PASSADO: cada dia em que houve hora apontada nesta etapa.
      const diasDaEtapa = feitoPorDia.get(chave(t.id, a.stageId)) ?? new Map<string, number>();
      for (const [dia, horas] of diasDaEtapa) {
        const c = celula(dia, t.id);
        c.doneHours += horas;
        c.lines.push({
          stageId: a.stageId,
          stageOrder: a.stage.order,
          stageName: a.stage.name,
          assigneeName: nome,
          hours: horas,
          estimated: false, // medido
          state: a.status === "COMPLETED" ? "done" : "pending",
        });
        marcarMovimento(dia, t.id);
      }

      // A etapa concluída aparece no dia em que fechou, mesmo sem apontamento — é um fato do
      // projeto. Sem hora, conta zero: preencher com estimativa seria fabricar histórico.
      if (a.status === "COMPLETED" && a.completedAt) {
        const dia = formatISODate(nowInSaoPaulo(a.completedAt));
        if (!diasDaEtapa.has(dia)) {
          celula(dia, t.id).lines.push({
            stageId: a.stageId,
            stageOrder: a.stage.order,
            stageName: a.stage.name,
            assigneeName: nome,
            hours: 0,
            estimated: false,
            state: "done",
          });
        }
        marcarMovimento(dia, t.id);
        continue;
      }

      // FUTURO (e hoje): o pendente, no dia que a projeção deu.
      const diaProjetado = projecao.get(a.id);
      if (!diaProjetado) continue;
      const c = celula(diaProjetado, t.id);
      c.pendingHours += pendente;
      c.lines.push({
        stageId: a.stageId,
        stageOrder: a.stage.order,
        stageName: a.stage.name,
        assigneeName: nome,
        hours: pendente,
        // O futuro é sempre referência, nunca medição.
        estimated: sourceDe(a.stageId) === "declared" || diaProjetado >= hojeISO,
        state: a.status === "ACTIVE" ? "pending" : "waiting",
      });
      marcarMovimento(diaProjetado, t.id);
    }
  }

  const diasComAlgo = [...movedDays].sort();
  const firstISO = diasComAlgo[0] ?? hojeISO;
  const lastISO = diasComAlgo[diasComAlgo.length - 1] ?? hojeISO;

  const demands: TimelineDemand[] = tarefas
    .map((t) => {
      const vencimento = t.dueDate ? formatISODate(t.dueDate) : null;
      const aberta =
        t.status !== "COMPLETED" && t.status !== "CANCELLED" && t.status !== "OBSOLETE";
      return {
        taskId: t.id,
        title: t.title,
        open: aberta,
        dueDateISO: vencimento,
        overdue: !!vencimento && vencimento < hojeISO && aberta,
      };
    })
    // Abertas primeiro, e entre elas a que se moveu mais recentemente. Num projeto antigo, ordenar
    // por criação encheria as primeiras colunas de demandas fechadas há meses.
    .sort((a, b) => {
      if (a.open !== b.open) return a.open ? -1 : 1;
      const ma = ultimoMovimento.get(a.taskId) ?? "";
      const mb = ultimoMovimento.get(b.taskId) ?? "";
      return mb.localeCompare(ma) || a.title.localeCompare(b.title);
    });

  return {
    rows: buildTimelineRows({ firstISO, lastISO, todayISO: hojeISO, movedDays }),
    demands,
    todayISO: hojeISO,
    byDay,
  };
}
