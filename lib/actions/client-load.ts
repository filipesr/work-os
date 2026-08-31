"use server";

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { formatISODate, mondayOfWeek, todayInSaoPaulo } from "@/lib/dates";
import { buildDayQueue, type QueueItemInput } from "@/lib/planning/day-queue";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { weekDays } from "@/lib/planning/week-days";
import { availableStageWhere, notDiscardedStageWhere } from "@/lib/task-availability";

/**
 * A mesma semana da mesa, pelo eixo do cliente.
 *
 * Leitura pura, sem nenhuma escrita: quem redistribui é a mesa. Um segundo lugar que também
 * escrevesse seria um segundo lugar para as duas divergirem.
 *
 * As horas de cada célula saem do MESMO `buildDayQueue` da mesa — inclusive a regra de que etapa
 * não liberada aparece mas não consome capacidade. Somar aqui o que a mesa não soma faria o mesmo
 * cliente ter dois números diferentes na mesma semana, e nenhum dos dois seria confiável.
 */

export type ClientDay = { hours: number; count: number };

export type ClientWeek = {
  clientId: string;
  clientName: string;
  totalHours: number;
  totalCount: number;
  byDay: Record<string, ClientDay>;
};

export type ClientLoad = { days: string[]; clients: ClientWeek[] };

export async function getClientLoad(mondayISO: string, teamId?: string): Promise<ClientLoad> {
  await requireManagerOrAdmin();

  const days = weekDays(mondayISO);
  const fim = new Date(`${days[5]}T23:59:59Z`);
  const semanaCorrente = formatISODate(mondayOfWeek(todayInSaoPaulo()));
  const inicio = days[0] > semanaCorrente ? new Date(`${days[0]}T00:00:00Z`) : null;

  const programados = await prisma.taskActiveStage.findMany({
    where: {
      status: { not: "COMPLETED" },
      // Demanda descartada não ocupa dia de ninguém — ver lib/task-availability.ts.
      ...notDiscardedStageWhere(),
      ...(teamId ? { assignee: { teams: { some: { id: teamId } } } } : {}),
      OR: [
        { plannedDate: { not: null, lte: fim, ...(inicio ? { gte: inicio } : {}) } },
        // Reivindicada e SEM dia entra na fila de HOJE, como na mesa e na tela da pessoa — senão
        // a carga do cliente mostraria menos do que ele está de fato consumindo esta semana.
        // `assigneeId` não nulo porque sem dono não é trabalho reivindicado, é fila.
        {
          plannedDate: null,
          status: "ACTIVE",
          assigneeId: { not: null },
          ...availableStageWhere(),
        },
      ],
    },
    select: {
      id: true,
      stageId: true,
      status: true,
      plannedDate: true,
      plannedOrder: true,
      scheduledStart: true,
      assignedAt: true,
      task: { select: { project: { select: { client: { select: { id: true, name: true } } } } } },
    },
    orderBy: [{ plannedOrder: "asc" }, { id: "asc" }],
  });

  const referencias = await getStageReferences([...new Set(programados.map((p) => p.stageId))]);
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;

  // Cliente → dia → itens. O atrasado cai no primeiro dia visível, como na mesa: some da tela
  // seria a pior perda, porque é silenciosa.
  const porCliente = new Map<string, { name: string; dias: Map<string, QueueItemInput[]> }>();
  const primeiroDia = days[0];
  const hojeISO = formatISODate(todayInSaoPaulo());
  const hojeNaSemana = days.includes(hojeISO) ? hojeISO : null;
  for (const row of programados) {
    const semDia = row.plannedDate === null;
    if (semDia && !hojeNaSemana) continue;
    const cliente = row.task.project.client;
    const planejado = semDia ? (hojeNaSemana as string) : formatISODate(row.plannedDate as Date);
    const dia = planejado < primeiroDia ? primeiroDia : planejado;
    const entrada = porCliente.get(cliente.id) ?? {
      name: cliente.name,
      dias: new Map<string, QueueItemInput[]>(),
    };
    const doDia = entrada.dias.get(dia) ?? [];
    doDia.push({
      id: row.id,
      available: row.status === "ACTIVE",
      semDia,
      claimedAt: row.assignedAt,
      plannedOrder: row.plannedOrder ?? 0,
      referenceHours: horasDe(row.stageId),
      scheduledStart: row.scheduledStart,
    });
    entrada.dias.set(dia, doDia);
    porCliente.set(cliente.id, entrada);
  }

  const clients: ClientWeek[] = [...porCliente.entries()].map(([clientId, entrada]) => {
    const byDay: Record<string, ClientDay> = {};
    let totalHours = 0;
    let totalCount = 0;
    for (const dia of days) {
      const itens = entrada.dias.get(dia) ?? [];
      const fila = buildDayQueue(itens);
      byDay[dia] = { hours: fila.usedHours, count: itens.length };
      totalHours += fila.usedHours;
      totalCount += itens.length;
    }
    return { clientId, clientName: entrada.name, totalHours, totalCount, byDay };
  });

  // Do que mais pega a semana para o que menos: a pergunta que traz o gestor aqui é "quem está
  // comendo a capacidade", e ela se responde na primeira linha.
  clients.sort((a, b) => b.totalHours - a.totalHours || a.clientName.localeCompare(b.clientName));

  return { days, clients };
}
