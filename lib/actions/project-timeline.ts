"use server";

import type { TaskPriority } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";
import { formatISODate, nowInSaoPaulo, todayInSaoPaulo } from "@/lib/dates";
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

/** As únicas quatro prioridades válidas. `?priority=` chega do query string como string crua — sem
 *  este filtro, um valor qualquer (`?priority=FOO`) ia direto pro Prisma com `as never` e estourava
 *  `PrismaClientValidationError` de dentro do Server Component (item 8 do ledger). */
const PRIORIDADES_VALIDAS = new Set<TaskPriority>(["LOW", "MEDIUM", "HIGH", "URGENT"]);

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
  const prioridadeValida =
    filters?.priority && PRIORIDADES_VALIDAS.has(filters.priority as TaskPriority)
      ? (filters.priority as TaskPriority)
      : undefined;

  const tarefas = await prisma.task.findMany({
    where: {
      projectId,
      ...(prioridadeValida ? { priority: prioridadeValida } : {}),
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

  // O dia real em que cada etapa foi LIBERADA (ficou ACTIVE) — `TaskActiveStage.activatedAt` é
  // `@default(now())` e nada no código o atualiza, então ele é sempre o dia de CRIAÇÃO da linha
  // (já coberto por `createdAt`), nunca o da liberação de verdade. Quem grava a liberação de
  // verdade é `lib/stage-transitions.ts`, em `StageTransition` — uma consulta a mais, em lote.
  const liberacoes = idsDasTarefas.length
    ? await prisma.stageTransition.findMany({
        where: { taskId: { in: idsDasTarefas }, status: "ACTIVE" },
        select: { taskId: true, stageId: true, at: true },
      })
    : [];

  const referencias = await getStageReferences([
    ...new Set(tarefas.flatMap((t) => t.activeStages.map((a) => a.stageId))),
  ]);
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;

  // (tarefa, etapa) → dia → horas, e (tarefa, etapa) → total para descontar da referência. Mapa
  // aninhado, e não chave concatenada: cada etapa lê só os SEUS dias, em vez de varrer a lista
  // inteira de apontamentos do projeto uma vez por etapa.
  const chave = (taskId: string, stageId: string) => `${taskId}::${stageId}`;
  const feitoPorDia = new Map<string, Map<string, number>>();
  const feitoPorEtapa = new Map<string, number>();
  // Hora apontada na demanda inteira, sem etapa (`stageId: null` — alcançável por `logTime` quando
  // a etapa ativa some do `activeStages[0]`, ou pelo "Apontar tempo" fora do guarda de etapa
  // corrente). Não é de etapa nenhuma, mas é hora de verdade: some na demanda (item 3 do ledger),
  // por dia, do mesmo jeito que as horas de etapa somam.
  const semEtapaPorDia = new Map<string, Map<string, number>>();
  for (const a of apontamentos) {
    const dia = formatISODate(nowInSaoPaulo(a.logDate));
    if (!a.stageId) {
      const porDia = semEtapaPorDia.get(a.taskId) ?? new Map<string, number>();
      porDia.set(dia, (porDia.get(dia) ?? 0) + a.hoursSpent);
      semEtapaPorDia.set(a.taskId, porDia);
      continue;
    }
    const k = chave(a.taskId, a.stageId);
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
  // `movedDays` decide que dias viram LINHA na grade — o projetado entra aí também, senão o futuro
  // some da tela. `ultimoMovimento` decide a ORDENAÇÃO das demandas, e essa é mais estreita: só
  // movimento REAL entra. Misturar os dois fazia o dia projetado (que pode cair semanas à frente)
  // vencer o "ontem" de verdade de uma demanda vencida — a metade da regra de ordenação sem teste
  // (item 1 do ledger). `real: false` é o único caso hoje: o ramo do futuro.
  const marcarMovimento = (dia: string, taskId: string, opts: { real: boolean }) => {
    movedDays.add(dia);
    if (!opts.real) return;
    const anterior = ultimoMovimento.get(taskId);
    if (!anterior || dia > anterior) ultimoMovimento.set(taskId, dia);
  };

  // Liberação de etapa é movimento real, do mesmo jeito que apontamento e conclusão — mas não
  // depende de percorrer `activeStages` de novo: já veio pronta da consulta em lote.
  for (const lib of liberacoes) {
    marcarMovimento(formatISODate(nowInSaoPaulo(lib.at)), lib.taskId, { real: true });
  }

  for (const t of tarefas) {
    // Criação e conclusão da demanda são movimento: é onde a história começa e termina.
    marcarMovimento(formatISODate(nowInSaoPaulo(t.createdAt)), t.id, { real: true });
    if (t.completedAt) {
      marcarMovimento(formatISODate(nowInSaoPaulo(t.completedAt)), t.id, { real: true });
    }

    // Hora apontada na demanda inteira, sem etapa (item 3 do ledger): ainda é hora de verdade,
    // ainda é movimento real, só não tem pra qual etapa ir.
    for (const [dia, horas] of semEtapaPorDia.get(t.id) ?? []) {
      const c = celula(dia, t.id);
      c.doneHours += horas;
      c.lines.push({
        stageId: "",
        stageOrder: 0,
        stageName: "",
        assigneeName: null,
        hours: horas,
        estimated: false,
        state: "done",
      });
      marcarMovimento(dia, t.id, { real: true });
    }

    // Demanda descartada: a HISTÓRIA continua (apontamentos e conclusões acima já valem), mas o
    // FUTURO dela não — cancelar não deveria continuar prometendo trabalho que ninguém vai fazer
    // (item 4 do ledger).
    const descartada = t.status === "CANCELLED" || t.status === "OBSOLETE";

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
        marcarMovimento(dia, t.id, { real: true });
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
        marcarMovimento(dia, t.id, { real: true });
        continue;
      }

      // Descartada: sem futuro (item 4). Sem pendente: zero é a etapa sem referência cadastrada,
      // ou já coberta pelo apontamento — nenhum dos dois justifica um bloco sozinho, e um bloco de
      // 0h vira ruído (linha duplicada com o "~0h" ao lado do apontamento real) (item 5).
      if (descartada || pendente <= 0) continue;

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
        // `diasFuturos` começa em hoje, então todo dia projetado é >= hoje: o futuro é SEMPRE
        // referência, nunca medição.
        estimated: true,
        state: a.status === "ACTIVE" ? "pending" : "waiting",
      });
      // Projeção, não fato: entra em `movedDays` (a régua tem que mostrar onde o trabalho cai),
      // mas não em `ultimoMovimento` — ordenar por isso foi o defeito do item 1.
      marcarMovimento(diaProjetado, t.id, { real: false });
    }
  }

  // Hoje é sempre a borda da janela — nunca só o que sobra dela. Num projeto todo concluído, todo
  // movimento é passado e `diasComAlgo` para bem antes de hoje: sem o piso/teto aqui, a régua do
  // meio nunca aparece, e junto some a informação de que o projeto está parado há N dias (item 2).
  const diasComAlgo = [...movedDays].sort();
  const menorDia = diasComAlgo[0] ?? hojeISO;
  const maiorDia = diasComAlgo[diasComAlgo.length - 1] ?? hojeISO;
  const firstISO = menorDia < hojeISO ? menorDia : hojeISO;
  const lastISO = maiorDia > hojeISO ? maiorDia : hojeISO;

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
