"use server";

import prisma from "@/lib/prisma";
import { getSessionUser } from "@/lib/permissions";
import {
  formatISODate,
  mondayOfWeek,
  todayInSaoPaulo,
  nowInSaoPaulo,
  shiftWeek,
} from "@/lib/dates";
import { buildDayQueue, type QueueItemInput } from "@/lib/planning/day-queue";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { weekDays } from "@/lib/planning/week-days";
import { isAboveOwnPace, PACE_HISTORY_WEEKS } from "@/lib/planning/own-pace";
import { stageTeamWhere } from "@/lib/stage-team";
import { DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";
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
  const inicioHistorico = new Date(
    `${formatISODate(shiftWeek(new Date(`${mondayISO}T00:00:00Z`), -PACE_HISTORY_WEEKS))}T00:00:00Z`
  );

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
        completedAt: { gte: inicioHistorico, lte: fim },
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
