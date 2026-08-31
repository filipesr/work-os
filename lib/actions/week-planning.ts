"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { formatISODate, mondayOfWeek, todayInSaoPaulo } from "@/lib/dates";
import { buildDayQueue, type QueueItemInput, type QueueSlot } from "@/lib/planning/day-queue";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { stageTeamWhere } from "@/lib/stage-team";
import { DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";
import { weekDays } from "@/lib/planning/week-days";
import { notDiscardedStageWhere } from "@/lib/task-availability";
import { applyDayReorder } from "@/lib/planning/reorder";

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

export async function getWeekPlanning(mondayISO: string, teamId?: string): Promise<WeekPlanning> {
  await requireManagerOrAdmin();

  const days = weekDays(mondayISO);
  const fim = new Date(`${days[5]}T23:59:59Z`);

  // O piso só some na semana CORRENTE (ou numa passada): ali, o que não foi feito ontem tem de
  // aparecer hoje, e sumir seria a pior perda porque é silenciosa. Numa semana FUTURA a pergunta é
  // outra — "onde ainda há espaço para distribuir" —, e sem piso todo item atrasado das semanas
  // anteriores desabaria no primeiro dia dela e no acumulado da pessoa: a semana que se está
  // planejando nasceria cheia, que é o oposto do que a tela serve para responder.
  const semanaCorrente = formatISODate(mondayOfWeek(todayInSaoPaulo()));
  const inicio = days[0] > semanaCorrente ? new Date(`${days[0]}T00:00:00Z`) : null;

  const [people, programados, livres] = await Promise.all([
    prisma.user.findMany({
      where: {
        // A mesa é de quem executa: conta de portal (`CLIENT`) e ex-colaborador desativado
        // ganhariam linha na grade — cada uma com o aviso de capacidade — e virariam alvo de
        // atribuição no diálogo de programar.
        role: { not: "CLIENT" },
        disabledAt: null,
        ...(teamId ? { teams: { some: { id: teamId } } } : {}),
      },
      select: { id: true, name: true, email: true, weeklyCapacityHours: true },
      orderBy: { name: "asc" },
    }),
    prisma.taskActiveStage.findMany({
      where: {
        // Na semana corrente, `lte: fim` sem piso: o item planejado para ANTES dela e não concluído
        // continua aparecendo (é realocado para o primeiro dia visível, logo abaixo). Numa semana
        // futura entra o piso — ver o comentário em `inicio`.
        plannedDate: { not: null, lte: fim, ...(inicio ? { gte: inicio } : {}) },
        status: { not: "COMPLETED" },
        // Demanda descartada não ocupa dia de ninguém — ver lib/task-availability.ts.
        ...notDiscardedStageWhere(),
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
          select: {
            title: true,
            project: { select: { client: { select: { name: true } } } },
            // Desde quando a etapa está em execução: o log ABERTO dela. Vem aninhado na própria
            // consulta da semana para não virar um N+1 por item. O `where` não alcança o `stageId`
            // da linha de fora, então traz os logs abertos da demanda e o casamento é feito abaixo
            // — são poucos por demanda (um por etapa em andamento).
            stageLogs: { where: { exitedAt: null }, select: { stageId: true, enteredAt: true } },
          },
        },
      },
      // Ordem de linha do Postgres não é garantida: sem `orderBy` a mesma célula podia listar os
      // itens em ordens diferentes entre dois carregamentos. `id` desempata quem tem o mesmo
      // `plannedOrder` — é o mesmo critério de `buildDayQueue`, e os dois precisam concordar.
      orderBy: [{ plannedOrder: "asc" }, { id: "asc" }],
    }),
    // O poço: etapas liberadas e sem dono.
    prisma.taskActiveStage.findMany({
      where: {
        assigneeId: null,
        status: "ACTIVE",
        // Sem filtro por `plannedDate`: uma etapa liberada e sem dono é do poço, tendo ou não data
        // velha. O resto do app desatribui etapa (o próprio responsável larga, uma reversão, uma
        // troca de time) e nem sempre sabe da programação — se o poço exigisse `plannedDate: null`,
        // a linha com data e sem dono não apareceria nem aqui nem na grade (que descarta item sem
        // responsável) e o trabalho sumiria da mesa sem volta.
        //
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
      // O `take` corta a lista, então sem ordem definida o corte cairia em itens diferentes a cada
      // carregamento — some do poço o que ninguém tirou de lá.
      orderBy: { id: "asc" },
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
      // Rótulos para a lista de conflitos: sem eles a tela sabe QUE algo está em risco, mas não O
      // QUE remarcar. Vêm de campos que a consulta acima já busca.
      taskTitle: row.task.title,
      stageName: row.stage.name,
      stageStatus: row.status,
      // Envelhecimento por ETAPA (nunca por pessoa): a tela mostra o decorrido ao lado da
      // referência quando passa dela. Só existe para etapa em execução — daí o log aberto.
      activeSince: row.task.stageLogs.find((l) => l.stageId === row.stageId)?.enteredAt ?? null,
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
      // `name ?? email ?? id`, a convenção do projeto: sem isto, uma conta sem nome preenchido
      // deixaria a linha inteira da grade sem rótulo — e a linha é a pessoa.
      name: u.name ?? u.email ?? u.id,
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

/** Sobe ou desce um item dentro do dia. As regras moram em `lib/planning/reorder.ts`, porque a
 *  tela da pessoa (fatia 2) reordena com exatamente as mesmas — e duas cópias divergiriam. */
export async function moveStageOrder(activeStageId: string, direction: "up" | "down") {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");
  const r = await applyDayReorder(activeStageId, direction);
  if ("problem" in r) return { error: t(r.problem) };
  revalidatePath("/planning/week");
  return { success: true as const };
}
