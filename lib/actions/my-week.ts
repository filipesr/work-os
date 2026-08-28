"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";
import {
  formatISODate,
  mondayOfWeek,
  todayInSaoPaulo,
  nowInSaoPaulo,
  shiftWeek,
  realInstant,
} from "@/lib/dates";
import { buildDayQueue, type QueueItemInput } from "@/lib/planning/day-queue";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { weekDays } from "@/lib/planning/week-days";
import { isAboveOwnPace, PACE_HISTORY_WEEKS } from "@/lib/planning/own-pace";
import { stageTeamWhere } from "@/lib/stage-team";
import { DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";
import { applyDayReorder } from "@/lib/planning/reorder";
// Import de TIPO: é apagado na compilação, então não é import de runtime de um arquivo
// `"use server"`. As duas telas descrevem a mesma coisa e um segundo tipo divergiria.
import type { DayView, PoolItem } from "@/lib/actions/week-planning";

/**
 * A semana da própria pessoa.
 *
 * Não existe `userId` na assinatura, e isso é decisão de segurança, não de estilo: com um parâmetro
 * de pessoa, quem descobrisse a URL leria a semana de qualquer outro, e a proteção passaria a
 * depender de nunca ninguém errar uma checagem. Sem ele, o erro é impossível de cometer.
 *
 * Toda a matemática é a da mesa do gestor (fatia 1): mesma fila do dia, mesma referência de
 * duração, mesma régua. Duas implementações da mesma leitura divergiriam, e a pessoa veria um
 * número diferente do que o gestor vê da semana dela.
 */

export type NextUp = { id: string; dayISO: string; taskTitle: string; stageName: string };

export type MyWeek = {
  days: string[];
  /** Hoje, se a semana em tela for a corrente. Fora dela não há "fim do dia" para anunciar. */
  todayISO: string | null;
  weeklyHours: number;
  usedHours: number;
  byDay: Record<string, DayView>;
  pool: PoolItem[];
  /** O próximo trabalho da semana, quando o dia de hoje já não tem nada executável. */
  nextUp: NextUp | null;
  /** Ver `lib/planning/own-pace.ts`. Calculado na renderização e descartado — nunca persistido. */
  praise: boolean;
};

export async function getMyWeek(mondayISO: string): Promise<MyWeek> {
  const me = await getSessionUser();
  const days = weekDays(mondayISO);
  const fim = new Date(`${days[5]}T23:59:59Z`);

  // Mesma regra da mesa: na semana corrente (ou passada) não há piso, para o atrasado continuar
  // aparecendo; numa semana futura o piso entra, senão a semana que se está planejando nasceria
  // cheia com o atraso das anteriores.
  const semanaCorrente = formatISODate(mondayOfWeek(todayInSaoPaulo()));
  const inicio = days[0] > semanaCorrente ? new Date(`${days[0]}T00:00:00Z`) : null;
  const hoje = formatISODate(todayInSaoPaulo());
  const todayISO = days.includes(hoje) ? hoje : null;

  // Os times vêm antes porque o poço depende deles. Com a pessoa sem time, `stageTeamWhere([])`
  // não casa com nada e o poço fica vazio — que é a verdade: não há trabalho que ela possa assumir.
  const eu = await prisma.user.findUnique({
    where: { id: me.id },
    select: { weeklyCapacityHours: true, teams: { select: { id: true } } },
  });
  const teamIds = eu?.teams.map((t) => t.id) ?? [];

  // Histórico de oito semanas para o reconhecimento, contado a partir da segunda em tela.
  //
  // `completedAt` é instante REAL (gravado com `new Date()`, ver `lib/actions/task.ts`) — diferente
  // de `plannedDate`, que é gravado como representação SP-local (meia-noite, sem hora de verdade).
  // `fim`/`inicio` acima servem só ao `plannedDate`: comparar `completedAt` contra eles erraria em
  // três horas, e o erro só aparece na borda do dia — uma conclusão de sábado à noite em São Paulo
  // vira domingo de madrugada em UTC e sumiria da consulta antes de chegar ao agrupamento. Bordas
  // PRÓPRIAS aqui, convertidas com `realInstant`.
  const inicioHistoricoSPLocal = new Date(
    `${formatISODate(shiftWeek(new Date(`${mondayISO}T00:00:00Z`), -PACE_HISTORY_WEEKS))}T00:00:00Z`
  );
  const inicioHistorico = realInstant(inicioHistoricoSPLocal);
  // A borda de cima vai até o fim do DOMINGO da semana em tela, não do sábado (`fim`, que para na
  // grade visível de segunda-a-sábado): o agrupamento abaixo usa `mondayOfWeek`, que enxerga a
  // semana como segunda-a-domingo e põe o domingo na semana que acabou de terminar. Se a consulta
  // parasse no sábado, o domingo da semana corrente nunca entraria nela — ficaria fora tanto do
  // histórico quanto da semana atual — e a comparação do reconhecimento ficaria enviesada contra
  // quem está sendo avaliado.
  const fimHistorico = realInstant(new Date(fim.getTime() + 86_400_000));

  const [programados, livres, concluidas] = await Promise.all([
    prisma.taskActiveStage.findMany({
      where: {
        assigneeId: me.id,
        plannedDate: { not: null, lte: fim, ...(inicio ? { gte: inicio } : {}) },
        status: { not: "COMPLETED" },
      },
      select: {
        id: true,
        stageId: true,
        status: true,
        plannedDate: true,
        plannedOrder: true,
        scheduledStart: true,
        stage: { select: { name: true } },
        task: {
          select: {
            title: true,
            project: { select: { client: { select: { name: true } } } },
            // Log ABERTO da etapa, para o envelhecimento. Aninhado na mesma consulta para não virar
            // um N+1 por item; o casamento por `stageId` é feito abaixo.
            stageLogs: { where: { exitedAt: null }, select: { stageId: true, enteredAt: true } },
          },
        },
      },
      orderBy: [{ plannedOrder: "asc" }, { id: "asc" }],
    }),
    prisma.taskActiveStage.findMany({
      where: { assigneeId: null, status: "ACTIVE", ...stageTeamWhere(teamIds) },
      select: {
        id: true,
        stageId: true,
        stage: { select: { name: true } },
        task: {
          select: { title: true, project: { select: { client: { select: { name: true } } } } },
        },
      },
      orderBy: { id: "asc" },
      take: 50,
    }),
    prisma.taskActiveStage.findMany({
      where: {
        assigneeId: me.id,
        status: "COMPLETED",
        completedAt: { gte: inicioHistorico, lte: fimHistorico },
      },
      select: { completedAt: true },
    }),
  ]);

  const referencias = await getStageReferences([
    ...new Set([...programados.map((p) => p.stageId), ...livres.map((l) => l.stageId)]),
  ]);
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;
  const sourceDe = (stageId: string) => referencias.get(stageId)?.source ?? "declared";

  const porDia = new Map<string, QueueItemInput[]>();
  const primeiroDia = days[0];
  for (const row of programados) {
    if (!row.plannedDate) continue;
    const planejado = formatISODate(row.plannedDate);
    const dia = planejado < primeiroDia ? primeiroDia : planejado;
    const doDia = porDia.get(dia) ?? [];
    doDia.push({
      id: row.id,
      available: row.status === "ACTIVE",
      plannedOrder: row.plannedOrder ?? 0,
      referenceHours: horasDe(row.stageId),
      referenceSource: sourceDe(row.stageId),
      scheduledStart: row.scheduledStart,
      taskTitle: row.task.title,
      stageName: row.stage.name,
      stageStatus: row.status,
      activeSince: row.task.stageLogs.find((l) => l.stageId === row.stageId)?.enteredAt ?? null,
    });
    porDia.set(dia, doDia);
  }

  const byDay: Record<string, DayView> = {};
  let usedHours = 0;
  for (const dia of days) {
    const fila = buildDayQueue(porDia.get(dia) ?? []);
    byDay[dia] = {
      slots: fila.slots,
      usedHours: fila.usedHours,
      nextRunnableId: fila.nextRunnableId,
    };
    usedHours += fila.usedHours;
  }

  // O fim do dia: com nada executável hoje, a tela oferece o próximo da SEQUÊNCIA — quem quiser
  // adiantar, adianta; quem não quiser, fechou o dia. É leitura, não ação: nada é movido.
  let nextUp: NextUp | null = null;
  if (todayISO && byDay[todayISO].nextRunnableId === null) {
    for (const dia of days.filter((d) => d > todayISO)) {
      const slot = byDay[dia].slots.find((s) => s.kind === "runnable" || s.kind === "scheduled");
      if (slot) {
        nextUp = {
          id: slot.item.id,
          dayISO: dia,
          taskTitle: slot.item.taskTitle ?? "",
          stageName: slot.item.stageName ?? "",
        };
        break;
      }
    }
  }

  // Contagem por semana, para o reconhecimento. `mondayOfWeek(nowInSaoPaulo(...))` porque as
  // funções de `lib/dates` trabalham na representação SP-local — comparar direto com o instante
  // UTC erraria a virada da semana.
  const porSemana = new Map<string, number>();
  for (const c of concluidas) {
    if (!c.completedAt) continue;
    const chave = formatISODate(mondayOfWeek(nowInSaoPaulo(c.completedAt)));
    porSemana.set(chave, (porSemana.get(chave) ?? 0) + 1);
  }
  const anteriores = [...porSemana.entries()]
    .filter(([semana, n]) => semana < mondayISO && n > 0)
    .map(([, n]) => n);
  const praise = isAboveOwnPace(porSemana.get(mondayISO) ?? 0, anteriores);

  return {
    days,
    todayISO,
    weeklyHours: eu?.weeklyCapacityHours ?? DEFAULT_WEEKLY_HOURS,
    usedHours,
    byDay,
    pool: livres.map((l) => ({
      id: l.id,
      taskTitle: l.task.title,
      stageName: l.stage.name,
      clientName: l.task.project.client.name,
      referenceHours: horasDe(l.stageId),
      referenceSource: sourceDe(l.stageId),
    })),
    nextUp,
    praise,
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Teto de quatro semanas. A tela só oferece os seis dias da semana, mas a ação não conhece a
 *  janela da tela — sem teto, um dígito errado estacionaria trabalho em 2031, onde ninguém olha. */
const MAX_AHEAD_DAYS = 28;

/** Valida a data pedida contra hoje. Devolve chave de erro ou nada. */
function problemaDeData(dateISO: string): "invalidDate" | "pastDate" | "tooFarAhead" | null {
  if (!DATE_ONLY.test(dateISO)) return "invalidDate";
  const hoje = formatISODate(todayInSaoPaulo());
  if (dateISO < hoje) return "pastDate";
  const limite = formatISODate(
    new Date(Date.parse(`${hoje}T00:00:00Z`) + MAX_AHEAD_DAYS * 86_400_000)
  );
  if (dateISO > limite) return "tooFarAhead";
  return null;
}

/** Próxima posição livre no dia de alguém. Entrar no FIM é o que impede quem chega depois de furar
 *  a ordem que a pessoa já montou. */
async function fimDaFila(userId: string, plannedDate: Date): Promise<number> {
  const ultimo = await prisma.taskActiveStage.aggregate({
    where: { assigneeId: userId, plannedDate },
    _max: { plannedOrder: true },
  });
  return (ultimo._max.plannedOrder ?? 0) + 1;
}

/** Reordena o próprio dia. As regras são as mesmas da mesa do gestor e moram em
 *  `lib/planning/reorder.ts`; aqui só entra o dono, que é o que impede reordenar o dia do colega
 *  mandando o id da etapa dele. */
export async function reorderMyDay(activeStageId: string, direction: "up" | "down") {
  const me = await getSessionUser();
  const t = await getTranslations("errors.myWeek");
  const r = await applyDayReorder(activeStageId, direction, me.id);
  if ("problem" in r) return { error: t(r.problem) };
  revalidatePath("/planning/my-week");
  return { success: true as const };
}

/** Assume uma etapa do poço. É o que permite a quem terminou cedo arrumar o que fazer sem esperar
 *  o gestor.
 *
 *  Três recusas, e nenhuma é burocracia: etapa com dono é trabalho de outra pessoa; etapa não
 *  liberada não pode ser executada (programar não libera); e etapa de outro time é trabalho que
 *  esta pessoa não pode assumir — a mesma regra de roteamento que o resto do app aplica a qualquer
 *  atribuição. */
export async function pullStageToMe(activeStageId: string, dateISO: string) {
  const me = await getSessionUser();
  const t = await getTranslations("errors.myWeek");

  const problema = problemaDeData(dateISO);
  if (problema) return { error: t(problema) };

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: {
      id: true,
      assigneeId: true,
      status: true,
      teamId: true,
      stage: { select: { defaultTeamId: true } },
    },
  });
  if (!row) return { error: t("stageNotFound") };
  if (row.assigneeId) return { error: t("alreadyAssigned") };
  if (row.status !== "ACTIVE") return { error: t("notAvailable") };

  // Time EFETIVO: a etapa coringa tem `teamId` nulo e herda o time do modelo. Comparar só o
  // `teamId` recusaria justamente as coringas, que são as mais abertas de todas. Ver lib/stage-team.ts.
  const timeEfetivo = row.teamId ?? row.stage.defaultTeamId;
  const meu = await prisma.user.findUnique({
    where: { id: me.id },
    select: { teams: { select: { id: true } } },
  });
  if (!timeEfetivo || !meu?.teams.some((x) => x.id === timeEfetivo)) {
    return { error: t("otherTeam") };
  }

  const plannedDate = new Date(`${dateISO}T00:00:00Z`);
  try {
    await prisma.taskActiveStage.update({
      where: { id: activeStageId },
      data: {
        // Os três juntos, sempre: dia sem dono some do poço E da grade ao mesmo tempo.
        assigneeId: me.id,
        plannedDate,
        plannedOrder: await fimDaFila(me.id, plannedDate),
      },
    });
  } catch (error) {
    console.error("pullStageToMe error:", error);
    return { error: t("pullFailed") };
  }

  revalidatePath("/planning/my-week");
  return { success: true as const };
}

/** Muda de dia uma etapa que já é sua. Antecipar já acontece por leitura; isto é para quando a
 *  pessoa SABE que terça não vai dar. Item com hora marcada não se move: ele é compromisso com
 *  alguém ou com algum lugar, e remarcar é conversa, não arrasto. */
export async function moveMyStageToDay(activeStageId: string, dateISO: string) {
  const me = await getSessionUser();
  const t = await getTranslations("errors.myWeek");

  const problema = problemaDeData(dateISO);
  if (problema) return { error: t(problema) };

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: { id: true, assigneeId: true, scheduledStart: true },
  });
  if (!row) return { error: t("stageNotFound") };
  if (row.assigneeId !== me.id) return { error: t("notYours") };
  if (row.scheduledStart) return { error: t("scheduledStage") };

  const plannedDate = new Date(`${dateISO}T00:00:00Z`);
  try {
    await prisma.taskActiveStage.update({
      where: { id: activeStageId },
      // Chega no fim do dia de destino: a ordem de lá é de quem já estava.
      data: { plannedDate, plannedOrder: await fimDaFila(me.id, plannedDate) },
    });
  } catch (error) {
    console.error("moveMyStageToDay error:", error);
    return { error: t("moveFailed") };
  }

  revalidatePath("/planning/my-week");
  return { success: true as const };
}
