"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { formatISODate } from "@/lib/dates";
import { buildDayQueue, type QueueItemInput, type QueueSlot } from "@/lib/planning/day-queue";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { stageTeamWhere } from "@/lib/stage-team";
import { DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";

/**
 * Mesa semanal do gestor: pessoa × dia.
 *
 * A capacidade que vale é a SEMANAL. O dia tem uma régua visual (8h) só para dar noção de quanto
 * já pegou — não é meta nem trava, porque o sistema não tem escala cadastrada e não sabe quem
 * trabalha sábado ou meio período. Quem distribui é o gestor.
 */

// `DEFAULT_WEEKLY_HOURS` e `DAY_VISUAL_HOURS` moraram aqui originalmente, mas um arquivo
// `"use server"` só pode exportar função assíncrona — mesmo um RE-EXPORT de `export const` quebra
// `next build` em runtime ("A 'use server' file can only export async functions", checado no
// registro de actions, não só na sintaxe). tsc e vitest não aplicam essa regra, então passavam
// batido. Os dois valores vivem em `lib/planning/week-capacity.ts`; quem precisa deles importa de
// lá diretamente, não daqui.

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
  /** Ver `QueueItemInput.referenceSource`: "declared" é estimativa (SLA ou nem isso), não medição. */
  referenceSource: "observed" | "declared";
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
      where: {
        assigneeId: null,
        status: "ACTIVE",
        plannedDate: null,
        // Sem `teamId`, o poço continua trazendo tudo, como hoje. Com a mesa filtrada por time,
        // restringe ao time EFETIVO (`stageTeamWhere`) — não a `teamId` puro, porque uma etapa
        // coringa (`teamId: null`) herda `stage.defaultTeamId`; filtrar só por `teamId` deixaria
        // essas de fora e o gestor nem saberia que existem para o time dele.
        ...(teamId ? stageTeamWhere(teamId) : {}),
      },
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
  // Sem entrada no Map = etapa nunca vista pelo getStageReferences (não deveria acontecer, dado o
  // Set acima) — cai no mesmo fallback do resolveStageReference: 0h, "declared". A tela trata os
  // dois casos (zero por falta de amostra E zero por falta de entrada) da mesma forma: estimativa,
  // nunca "etapa de graça".
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;
  const sourceDe = (stageId: string) => referencias.get(stageId)?.source ?? "declared";

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
      referenceSource: sourceDe(row.stageId),
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
      referenceSource: sourceDe(l.stageId),
    })),
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Põe a etapa no dia de alguém. Programar ATRIBUI — inclusive etapa ainda não liberada, que é
 *  trabalho com dono à espera de liberar. Etapa de outra pessoa não é puxável por aqui: remanejar
 *  responsável é decisão da própria etapa, não efeito colateral de arrastar na agenda. */
export async function scheduleStage(input: {
  activeStageId: string;
  userId: string;
  dateISO: string;
}) {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");

  if (!DATE_ONLY.test(input.dateISO)) return { error: t("invalidDate") };

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: input.activeStageId },
    select: { id: true, assigneeId: true, status: true },
  });
  if (!row) return { error: t("stageNotFound") };
  if (row.status === "COMPLETED") return { error: t("completedStage") };
  if (row.assigneeId && row.assigneeId !== input.userId) return { error: t("alreadyAssigned") };

  const plannedDate = new Date(`${input.dateISO}T00:00:00Z`);

  // Entra no FIM do dia: quem chega depois não fura a ordem que a pessoa já montou.
  const ultimo = await prisma.taskActiveStage.aggregate({
    where: { assigneeId: input.userId, plannedDate },
    _max: { plannedOrder: true },
  });

  try {
    await prisma.taskActiveStage.update({
      where: { id: input.activeStageId },
      data: {
        assigneeId: input.userId,
        plannedDate,
        plannedOrder: (ultimo._max.plannedOrder ?? 0) + 1,
      },
    });
  } catch (error) {
    console.error("scheduleStage error:", error);
    return { error: t("scheduleFailed") };
  }

  revalidatePath("/planning/week");
  return { success: true as const };
}

/** Tira da programação e devolve ao poço. O `assigneeId` sai junto: manter o dono sem dia deixaria
 *  a etapa presa a alguém e invisível no poço — o pior dos dois mundos. */
export async function unscheduleStage(activeStageId: string) {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: { id: true, assigneeId: true, status: true },
  });
  if (!row) return { error: t("stageNotFound") };

  try {
    await prisma.taskActiveStage.update({
      where: { id: activeStageId },
      data: { plannedDate: null, plannedOrder: null, assigneeId: null },
    });
  } catch (error) {
    console.error("unscheduleStage error:", error);
    return { error: t("scheduleFailed") };
  }

  revalidatePath("/planning/week");
  return { success: true as const };
}

/** Sobe ou desce um item dentro do dia, trocando de posição com o vizinho. Troca em vez de
 *  renumerar tudo: duas escritas em vez de N, e a ordem dos outros não muda por tabela. */
export async function moveStageOrder(activeStageId: string, direction: "up" | "down") {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");

  const alvo = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: {
      id: true,
      assigneeId: true,
      plannedDate: true,
      plannedOrder: true,
      scheduledStart: true,
    },
  });
  if (!alvo || !alvo.assigneeId || !alvo.plannedDate) return { error: t("stageNotFound") };
  // Item com horário marcado não entra na ordenação manual — ele acontece na hora dele, não na
  // vez dele. Ordenar um compromisso marcado seria fingir que ele espera a vez.
  if (alvo.scheduledStart) return { error: t("scheduledStage") };

  const doDia = await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: alvo.assigneeId,
      plannedDate: alvo.plannedDate,
      status: { not: "COMPLETED" },
      scheduledStart: null,
    },
    select: { id: true, plannedOrder: true },
    orderBy: { plannedOrder: "asc" },
  });

  const i = doDia.findIndex((x) => x.id === activeStageId);
  const j = direction === "up" ? i - 1 : i + 1;
  // Fora da lista não é erro: a seta simplesmente não tem para onde ir.
  if (i < 0 || j < 0 || j >= doDia.length) return { success: true as const };

  try {
    await prisma.taskActiveStage.update({
      where: { id: doDia[i].id },
      data: { plannedOrder: doDia[j].plannedOrder },
    });
    await prisma.taskActiveStage.update({
      where: { id: doDia[j].id },
      data: { plannedOrder: doDia[i].plannedOrder },
    });
  } catch (error) {
    console.error("moveStageOrder error:", error);
    return { error: t("reorderFailed") };
  }

  revalidatePath("/planning/week");
  return { success: true as const };
}
