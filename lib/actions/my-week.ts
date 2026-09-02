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
import { getWeekDone } from "@/lib/planning/week-done";
import { weekDays } from "@/lib/planning/week-days";
import { notDiscardedStageWhere } from "@/lib/task-availability";
import { isAboveOwnPace, PACE_HISTORY_WEEKS } from "@/lib/planning/own-pace";
import { stageTeamWhere } from "@/lib/stage-team";
import { DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";
import { applyDayReorder } from "@/lib/planning/reorder";
// O caminho canônico de reivindicar uma etapa. Ver `pullStageToMe`: a atribuição é dele, não daqui.
import { claimActiveStage } from "@/lib/actions/task";
import { availableStageWhere } from "@/lib/task-availability";
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
  /** Horas APONTADAS na semana — ao lado de `usedHours`, nunca somada a ela. */
  doneHours: number;
  byDay: Record<string, DayView>;
  pool: PoolItem[];
  /** O próximo trabalho da semana, quando o dia de hoje já não tem nada executável. */
  nextUp: NextUp | null;
  /** Hoje TINHA itens e nenhum deles está executável agora. Dia vazio não é dia cumprido. */
  dayDone: boolean;
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
        status: { not: "COMPLETED" },
        // Demanda descartada não ocupa dia de ninguém — ver lib/task-availability.ts.
        ...notDiscardedStageWhere(),
        OR: [
          { plannedDate: { not: null, lte: fim, ...(inicio ? { gte: inicio } : {}) } },
          // Reivindicada e SEM dia: entra na fila de HOJE por leitura — nada é gravado, o
          // `plannedDate` continua vazio. Pegar uma etapa é dizer "estou fazendo isto agora", e
          // sem esta condição o trabalho puxado pelo painel ficava invisível na programação: nem
          // na grade (que lê por dia) nem no poço (que exige etapa sem dono).
          //
          // Só LIBERADA entra. Etapa atribuída e ainda INACTIVE tem dono desde a criação e espera
          // a anterior fechar — se entrasse, a fila de hoje nasceria com todas as etapas futuras
          // de todas as demandas da pessoa, que é o oposto do que a fila responde.
          { plannedDate: null, status: "ACTIVE", ...availableStageWhere() },
        ],
      },
      select: {
        id: true,
        stageId: true,
        status: true,
        plannedDate: true,
        plannedOrder: true,
        scheduledStart: true,
        scheduledEnd: true,
        assignedAt: true,
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
      where: {
        assigneeId: null,
        status: "ACTIVE",
        ...stageTeamWhere(teamIds),
        // A MESMA condição que o poço do dashboard aplica (`getTeamBacklog`): demanda com início
        // planejado no futuro não é trabalho para pegar hoje. Sem ela, os dois poços mostram listas
        // diferentes na mesma sessão — e é este o modo de falha que `lib/task-availability.ts`
        // previa: "basta uma tela nova esquecer a condição para a demanda futura reaparecer só ali".
        ...availableStageWhere(),
      },
      select: {
        id: true,
        stageId: true,
        stage: { select: { name: true } },
        task: {
          select: { title: true, project: { select: { client: { select: { name: true } } } } },
        },
      },
      orderBy: { id: "asc" },
      // O mesmo teto da mesa do gestor. Um poço truncado em silêncio faz sumir trabalho que
      // ninguém tirou de lá — e ninguém procura o que não sabe que existe.
      take: 200,
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
    // Sem dia = reivindicada e ainda não programada. O lugar dela é a fila de HOJE, e só quando
    // hoje está na semana em tela: navegar para a semana que vem não pode arrastar o que está
    // sendo feito agora. Fora dessa janela ela simplesmente não aparece — nada é gravado, então
    // nada precisa ser desfeito depois.
    const semDia = row.plannedDate === null;
    if (semDia && !todayISO) continue;
    const planejado = semDia ? (todayISO as string) : formatISODate(row.plannedDate as Date);
    const dia = planejado < primeiroDia ? primeiroDia : planejado;
    const doDia = porDia.get(dia) ?? [];
    doDia.push({
      id: row.id,
      available: row.status === "ACTIVE",
      semDia,
      claimedAt: row.assignedAt,
      plannedOrder: row.plannedOrder ?? 0,
      referenceHours: horasDe(row.stageId),
      referenceSource: sourceDe(row.stageId),
      scheduledStart: row.scheduledStart,
      scheduledEnd: row.scheduledEnd,
      taskTitle: row.task.title,
      stageName: row.stage.name,
      stageStatus: row.status,
      activeSince: row.task.stageLogs.find((l) => l.stageId === row.stageId)?.enteredAt ?? null,
    });
    porDia.set(dia, doDia);
  }

  // O MESMO feito que a mesa do gestor mostra — mesma função, mesma regra de dia. A pessoa não
  // pode ver da própria semana um número diferente do que o gestor vê dela.
  const feito = await getWeekDone([me.id], days);

  const byDay: Record<string, DayView> = {};
  let usedHours = 0;
  let doneHours = 0;
  for (const dia of days) {
    const fila = buildDayQueue(porDia.get(dia) ?? []);
    const feitoNoDia = feito.hours.get(me.id)?.get(dia) ?? 0;
    byDay[dia] = {
      slots: fila.slots,
      usedHours: fila.usedHours,
      nextRunnableId: fila.nextRunnableId,
      done: feito.lines.get(me.id)?.get(dia) ?? [],
      doneHours: feitoNoDia,
    };
    usedHours += fila.usedHours;
    doneHours += feitoNoDia;
  }

  // "Dia cumprido" é uma afirmação sobre trabalho FEITO, e um dia vazio não cumpriu nada: sem o
  // `slots.length`, uma quinta sem nenhum item renderizava "Nada programado neste dia." e logo
  // abaixo "Dia cumprido." — a tela se contradizendo em duas linhas.
  const dayDone =
    todayISO !== null &&
    byDay[todayISO].slots.length > 0 &&
    byDay[todayISO].nextRunnableId === null;

  // O fim do dia: com nada executável hoje, a tela oferece o próximo da SEQUÊNCIA — quem quiser
  // adiantar, adianta; quem não quiser, fechou o dia. É leitura, não ação: nada é movido.
  //
  // A varredura é CRONOLÓGICA e pula só o dia de hoje, em vez de olhar apenas o futuro: se a quarta
  // ficou com duas etapas por fazer e hoje é quinta, o convite tem que ser a pendência da quarta,
  // não um item de sexta oferecido por cima do atrasado. `days` já vem em ordem.
  let nextUp: NextUp | null = null;
  if (todayISO && byDay[todayISO].nextRunnableId === null) {
    for (const dia of days.filter((d) => d !== todayISO)) {
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
    doneHours,
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
    dayDone,
    praise,
  };
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Teto de quatro semanas. A tela só oferece os seis dias da semana, mas a ação não conhece a
 *  janela da tela — sem teto, um dígito errado estacionaria trabalho em 2031, onde ninguém olha. */
const MAX_AHEAD_DAYS = 28;

/** Valida a data pedida contra hoje. Devolve chave de erro ou nada. */
function problemaDeData(
  dateISO: string
): "invalidDate" | "pastDate" | "tooFarAhead" | "sundayDate" | null {
  if (!DATE_ONLY.test(dateISO)) return "invalidDate";
  const hoje = formatISODate(todayInSaoPaulo());
  if (dateISO < hoje) return "pastDate";
  // Domingo não existe na grade: as três telas (minha semana, mesa do gestor e carga por cliente)
  // mostram de segunda a sábado. Um item movido para domingo sumiria das três até aquela semana
  // virar corrente, e voltaria grudado na segunda — some em silêncio, que é a pior forma de sumir.
  if (new Date(`${dateISO}T00:00:00Z`).getUTCDay() === 0) return "sundayDate";
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
 *  A atribuição NÃO é escrita aqui: ela é delegada a `claimActiveStage`, o caminho canônico de
 *  reivindicar (o mesmo que a tela de tarefas usa). Escrever `assigneeId` direto seria uma segunda
 *  porta que pula tudo o que reivindicar faz — e três dessas coisas doem de verdade:
 *
 *    - o LIMITE DE WIP, que existe como restrição de pull: por esta tela a pessoa furaria o limite
 *      e o cockpit de saúde acusaria a violação depois, sem ninguém saber de onde veio;
 *    - o `TaskStageLog` ABERTO, que é de onde sai `activeSince` — o envelhecimento por etapa que
 *      ESTAS DUAS TELAS exibem morreria justamente nos itens que esta ação cria;
 *    - o carimbo de `markTaskStarted`, sem o qual a rede de segurança de `completeStage` carimba só
 *      na conclusão e o cycle time da tarefa colapsa para perto de zero.
 *
 *  Fica aqui só o que `claimActiveStage` não faz: a validação de TIME EFETIVO (ela não valida time)
 *  e a da data. As recusas de dono e de etapa não liberada são dela, e a mensagem dela é melhor que
 *  uma genérica daqui — ela diz, por exemplo, quantos itens já estão em andamento no limite de WIP. */
export async function pullStageToMe(activeStageId: string, dateISO: string) {
  const me = await getSessionUser();
  const t = await getTranslations("errors.myWeek");

  const problema = problemaDeData(dateISO);
  if (problema) return { error: t(problema) };

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: {
      id: true,
      taskId: true,
      stageId: true,
      assigneeId: true,
      status: true,
      teamId: true,
      stage: { select: { defaultTeamId: true } },
    },
  });
  if (!row) return { error: t("stageNotFound") };

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

  // A atribuição inteira, com WIP, log de etapa, carimbo de início e comentário.
  const claim = await claimActiveStage(row.taskId, row.stageId);
  if ("error" in claim) return { error: claim.error };

  // São DUAS escritas, e a invariante `plannedDate` ⟷ `assigneeId` fica exposta se esta falhar.
  // É aceitável porque a falha deixa a etapa COM DONO E SEM DIA, que é o lado seguro: ela continua
  // visível em "Meu trabalho" e no poço da mesa do gestor, e alguém a reprograma. O inverso — dia
  // sem dono — é que sumiria de todas as telas ao mesmo tempo, e some em silêncio.
  const plannedDate = new Date(`${dateISO}T00:00:00Z`);
  try {
    await prisma.taskActiveStage.update({
      where: { id: activeStageId },
      // A janela fixa NÃO é herdada do poço. Ela é um compromisso combinado com alguém de fora
      // PARA AQUELE dia e AQUELA pessoa — a que largou a etapa. Puxada para cá com a hora intacta,
      // a etapa nasceria na minha semana já "agendada" num horário que ninguém marcou comigo, e
      // ancorado num dia que não é mais o dela. Mesma limpeza de `unscheduleStage`: quem perde o
      // dia perde o compromisso.
      data: {
        plannedDate,
        plannedOrder: await fimDaFila(me.id, plannedDate),
        scheduledStart: null,
        scheduledEnd: null,
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
    select: { id: true, assigneeId: true, status: true, scheduledStart: true },
  });
  if (!row) return { error: t("stageNotFound") };
  if (row.assigneeId !== me.id) return { error: t("notYours") };
  // Etapa concluída não se reprograma: mudar o dia de algo já feito só produziria uma semana que
  // não descreve trabalho nenhum. É a mesma recusa que `scheduleStage` faz na mesa do gestor.
  if (row.status === "COMPLETED") return { error: t("completedStage") };
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
