"use server";

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { formatISODate } from "@/lib/dates";
import { buildDayQueue, type QueueItemInput, type QueueSlot } from "@/lib/planning/day-queue";
import { getStageReferences } from "@/lib/planning/stage-reference";

/**
 * Mesa semanal do gestor: pessoa × dia.
 *
 * A capacidade que vale é a SEMANAL. O dia tem uma régua visual (8h) só para dar noção de quanto
 * já pegou — não é meta nem trava, porque o sistema não tem escala cadastrada e não sabe quem
 * trabalha sábado ou meio período. Quem distribui é o gestor.
 */

/** Referência semanal de quem não tem `weeklyCapacityHours` preenchido. */
export const DEFAULT_WEEKLY_HOURS = 45;

/** Régua VISUAL do dia. Não é meta: ver o comentário acima. */
export const DAY_VISUAL_HOURS = 8;

export type DayView = { slots: QueueSlot[]; usedHours: number; nextRunnableId: string | null };

export type PersonWeek = {
  userId: string;
  name: string;
  weeklyHours: number;
  usedHours: number;
  byDay: Record<string, DayView>;
};

export type PoolItem = {
  id: string;
  taskTitle: string;
  stageName: string;
  clientName: string;
  referenceHours: number;
};

export type WeekPlanning = { days: string[]; people: PersonWeek[]; pool: PoolItem[] };

/** Segunda a sábado. Sábado é coluna normal — recebe se o gestor colocar. */
function weekDays(mondayISO: string): string[] {
  const base = Date.parse(`${mondayISO}T00:00:00Z`);
  return Array.from({ length: 6 }, (_, i) => formatISODate(new Date(base + i * 86_400_000)));
}

export async function getWeekPlanning(mondayISO: string, teamId?: string): Promise<WeekPlanning> {
  await requireManagerOrAdmin();

  const days = weekDays(mondayISO);
  const inicio = new Date(`${days[0]}T00:00:00Z`);
  const fim = new Date(`${days[5]}T23:59:59Z`);

  const [people, programados, livres] = await Promise.all([
    prisma.user.findMany({
      where: teamId ? { teams: { some: { id: teamId } } } : {},
      select: { id: true, name: true, weeklyCapacityHours: true },
      orderBy: { name: "asc" },
    }),
    prisma.taskActiveStage.findMany({
      where: {
        // `lte: fim` sem piso inferior de propósito: item planejado para ANTES desta semana e não
        // concluído precisa continuar aparecendo, senão trabalho atrasado sumiria da tela na virada
        // da semana — o pior tipo de perda, porque é silenciosa. Ele é realocado para o primeiro dia
        // visível logo abaixo.
        plannedDate: { not: null, lte: fim },
        status: { not: "COMPLETED" },
        ...(teamId ? { assignee: { teams: { some: { id: teamId } } } } : {}),
      },
      select: {
        id: true,
        stageId: true,
        assigneeId: true,
        status: true,
        plannedDate: true,
        plannedOrder: true,
        scheduledStart: true,
        stage: { select: { name: true } },
        task: {
          select: { title: true, project: { select: { client: { select: { name: true } } } } },
        },
      },
    }),
    // O poço: etapas liberadas, sem dono e ainda não programadas.
    prisma.taskActiveStage.findMany({
      where: { assigneeId: null, status: "ACTIVE", plannedDate: null },
      select: {
        id: true,
        stageId: true,
        stage: { select: { name: true } },
        task: {
          select: { title: true, project: { select: { client: { select: { name: true } } } } },
        },
      },
      take: 200,
    }),
  ]);

  const referencias = await getStageReferences([
    ...new Set([...programados.map((p) => p.stageId), ...livres.map((l) => l.stageId)]),
  ]);
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;

  const porPessoaEDia = new Map<string, Map<string, QueueItemInput[]>>();
  const primeiroDia = days[0];
  for (const row of programados) {
    if (!row.assigneeId || !row.plannedDate) continue;
    const planejado = formatISODate(row.plannedDate);
    // Atrasado de semanas anteriores entra no primeiro dia visível. É a rolagem da spec aplicada à
    // mesa do gestor: o item não some, aparece onde ainda dá para agir sobre ele.
    const dia = planejado < primeiroDia ? primeiroDia : planejado;
    const daPessoa = porPessoaEDia.get(row.assigneeId) ?? new Map<string, QueueItemInput[]>();
    const doDia = daPessoa.get(dia) ?? [];
    doDia.push({
      id: row.id,
      // Programar NÃO libera: só a etapa ACTIVE pode ser executada.
      available: row.status === "ACTIVE",
      plannedOrder: row.plannedOrder ?? 0,
      referenceHours: horasDe(row.stageId),
      scheduledStart: row.scheduledStart,
    });
    daPessoa.set(dia, doDia);
    porPessoaEDia.set(row.assigneeId, daPessoa);
  }

  const peopleOut: PersonWeek[] = people.map((u) => {
    const byDay: Record<string, DayView> = {};
    let usedHours = 0;
    for (const dia of days) {
      const itens = porPessoaEDia.get(u.id)?.get(dia) ?? [];
      const fila = buildDayQueue(itens);
      byDay[dia] = {
        slots: fila.slots,
        usedHours: fila.usedHours,
        nextRunnableId: fila.nextRunnableId,
      };
      usedHours += fila.usedHours;
    }
    return {
      userId: u.id,
      name: u.name ?? "",
      weeklyHours: u.weeklyCapacityHours ?? DEFAULT_WEEKLY_HOURS,
      usedHours,
      byDay,
    };
  });

  return {
    days,
    people: peopleOut,
    pool: livres.map((l) => ({
      id: l.id,
      taskTitle: l.task.title,
      stageName: l.stage.name,
      clientName: l.task.project.client.name,
      referenceHours: horasDe(l.stageId),
    })),
  };
}
