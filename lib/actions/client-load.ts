"use server";

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import {
  formatISODate,
  mondayOfWeek,
  nowInSaoPaulo,
  realInstant,
  todayInSaoPaulo,
} from "@/lib/dates";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { weekDays } from "@/lib/planning/week-days";
import { availableStageWhere, notDiscardedStageWhere } from "@/lib/task-availability";

/**
 * A semana pelo eixo do cliente: o que já foi FEITO e o que ainda está por fazer.
 *
 * Leitura pura, sem nenhuma escrita: quem redistribui é a mesa. Um segundo lugar que também
 * escrevesse seria um segundo lugar para as duas divergirem.
 *
 * Aqui a pergunta é outra que a da mesa, e por isso o filtro é outro. A mesa responde "o que falta
 * fazer", então esconde o concluído. Esta tela responde "quanto desta semana este cliente ocupou",
 * e sem o concluído a leitura se inverte: a carga ENCOLHE conforme a semana avança, e quem mais
 * entregou aparece como quem menos ocupou.
 *
 * As horas são de REFERÊNCIA nos dois lados — feito e por fazer contam pelo mesmo p50/SLA da
 * etapa. Uma unidade só na célula: misturar hora apontada com hora de referência no mesmo total
 * já custou um bug nesta base, e o apontamento é voluntário demais para servir de denominador.
 *
 * Etapa não liberada aparece na lista mas não soma — a mesma regra da mesa. Trabalho que ninguém
 * pode começar não é carga de ninguém.
 */

/** Uma etapa dentro do bloco da demanda, na ordem sequencial do fluxo. */
export type StageLine = {
  id: string;
  stageOrder: number;
  stageName: string;
  assigneeName: string | null;
  hours: number;
  /** `done` = concluída; `pending` = ativa ou na fila; `waiting` = ainda não liberada (não soma). */
  state: "done" | "pending" | "waiting";
};

/** Um bloco por demanda dentro da célula do dia. */
export type TaskBlock = {
  taskId: string;
  projectName: string;
  taskTitle: string;
  doneHours: number;
  pendingHours: number;
  stages: StageLine[];
};

export type ClientDay = { doneHours: number; pendingHours: number; tasks: TaskBlock[] };

export type ClientWeek = {
  clientId: string;
  clientName: string;
  totalDone: number;
  totalPending: number;
  byDay: Record<string, ClientDay>;
};

export type ClientLoad = { days: string[]; clients: ClientWeek[] };

export async function getClientLoad(mondayISO: string, teamId?: string): Promise<ClientLoad> {
  await requireManagerOrAdmin();

  const days = weekDays(mondayISO);
  const fim = new Date(`${days[5]}T23:59:59Z`);
  const semanaCorrente = formatISODate(mondayOfWeek(todayInSaoPaulo()));
  const inicio = days[0] > semanaCorrente ? new Date(`${days[0]}T00:00:00Z`) : null;
  // `completedAt` é instante REAL (gravado com `new Date()`), e não a representação SP-local que
  // `plannedDate` usa. Comparar as duas convenções erra em três horas e some com o que foi
  // concluído à noite — ver `realInstant` em lib/dates.ts.
  const inicioReal = realInstant(new Date(`${days[0]}T00:00:00Z`));
  const fimReal = realInstant(fim);

  const linhas = await prisma.taskActiveStage.findMany({
    where: {
      // Demanda descartada não ocupa dia de ninguém — ver lib/task-availability.ts.
      ...notDiscardedStageWhere(),
      ...(teamId ? { assignee: { teams: { some: { id: teamId } } } } : {}),
      OR: [
        // 1. Programada para a semana e ainda não concluída.
        {
          status: { not: "COMPLETED" },
          plannedDate: { not: null, lte: fim, ...(inicio ? { gte: inicio } : {}) },
        },
        // 2. Reivindicada e SEM dia: entra na fila de HOJE, como na mesa e na tela da pessoa.
        //    `assigneeId` não nulo porque sem dono não é trabalho reivindicado, é fila.
        {
          status: "ACTIVE",
          plannedDate: null,
          assigneeId: { not: null },
          ...availableStageWhere(),
        },
        // 3. CONCLUÍDA na semana — o que dá a percepção do executado. Posicionada pelo dia em que
        //    foi concluída, que é o dia em que o cliente de fato consumiu a agência.
        { status: "COMPLETED", completedAt: { gte: inicioReal, lte: fimReal } },
      ],
    },
    select: {
      id: true,
      stageId: true,
      status: true,
      plannedDate: true,
      completedAt: true,
      task: {
        select: {
          id: true,
          title: true,
          project: { select: { name: true, client: { select: { id: true, name: true } } } },
        },
      },
      stage: { select: { name: true, order: true } },
      assignee: { select: { name: true, email: true } },
    },
    // A ordem das ETAPAS dentro do bloco é a do fluxo: quem lê a célula lê a demanda andando.
    orderBy: [{ stage: { order: "asc" } }, { id: "asc" }],
  });

  const referencias = await getStageReferences([...new Set(linhas.map((l) => l.stageId))]);
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;

  const primeiroDia = days[0];
  const hojeISO = formatISODate(todayInSaoPaulo());
  const hojeNaSemana = days.includes(hojeISO) ? hojeISO : null;

  // cliente → dia → demanda → bloco. Três níveis porque a célula tem três: o cliente é a linha, o
  // dia é a coluna, e dentro dela a demanda agrupa as etapas.
  type Acc = { name: string; dias: Map<string, Map<string, TaskBlock>> };
  const porCliente = new Map<string, Acc>();

  for (const row of linhas) {
    const concluida = row.status === "COMPLETED";
    const semDia = !concluida && row.plannedDate === null;
    if (semDia && !hojeNaSemana) continue;

    // Concluída vale pelo dia em que fechou; o resto, pelo dia planejado — e o atrasado cai no
    // primeiro dia visível, como na mesa: sumir da tela seria a pior perda, porque é silenciosa.
    const dataBase = concluida
      ? row.completedAt
        ? formatISODate(nowInSaoPaulo(row.completedAt))
        : null
      : semDia
        ? (hojeNaSemana as string)
        : formatISODate(row.plannedDate as Date);
    if (!dataBase) continue;
    const dia = dataBase < primeiroDia ? primeiroDia : dataBase;
    if (!days.includes(dia)) continue;

    const cliente = row.task.project.client;
    const acc = porCliente.get(cliente.id) ?? { name: cliente.name, dias: new Map() };
    const doDia = acc.dias.get(dia) ?? new Map<string, TaskBlock>();
    const bloco = doDia.get(row.task.id) ?? {
      taskId: row.task.id,
      projectName: row.task.project.name,
      taskTitle: row.task.title,
      doneHours: 0,
      pendingHours: 0,
      stages: [],
    };

    const horas = horasDe(row.stageId);
    // Não liberada aparece e NÃO soma: trabalho que ninguém pode começar não é carga de ninguém.
    const state: StageLine["state"] = concluida
      ? "done"
      : row.status === "ACTIVE"
        ? "pending"
        : "waiting";
    if (state === "done") bloco.doneHours += horas;
    else if (state === "pending") bloco.pendingHours += horas;

    bloco.stages.push({
      id: row.id,
      stageOrder: row.stage.order,
      stageName: row.stage.name,
      assigneeName: row.assignee?.name ?? row.assignee?.email ?? null,
      hours: horas,
      state,
    });

    doDia.set(row.task.id, bloco);
    acc.dias.set(dia, doDia);
    porCliente.set(cliente.id, acc);
  }

  const clients: ClientWeek[] = [...porCliente.entries()].map(([clientId, acc]) => {
    const byDay: Record<string, ClientDay> = {};
    let totalDone = 0;
    let totalPending = 0;
    for (const dia of days) {
      const blocos = [...(acc.dias.get(dia)?.values() ?? [])];
      const doneHours = blocos.reduce((n, b) => n + b.doneHours, 0);
      const pendingHours = blocos.reduce((n, b) => n + b.pendingHours, 0);
      byDay[dia] = { doneHours, pendingHours, tasks: blocos };
      totalDone += doneHours;
      totalPending += pendingHours;
    }
    return { clientId, clientName: acc.name, totalDone, totalPending, byDay };
  });

  // Do que mais pega a semana para o que menos: a pergunta que traz o gestor aqui é "quem está
  // comendo a capacidade", e ela se responde na primeira linha. Feito + por fazer, porque as duas
  // metades são ocupação da agência.
  clients.sort(
    (a, b) =>
      b.totalDone + b.totalPending - (a.totalDone + a.totalPending) ||
      a.clientName.localeCompare(b.clientName)
  );

  return { days, clients };
}
