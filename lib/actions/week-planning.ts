"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { TaskPriority } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { formatISODate, mondayOfWeek, realInstant, todayInSaoPaulo } from "@/lib/dates";
import { buildDayQueue, type QueueItemInput, type QueueSlot } from "@/lib/planning/day-queue";
import { getStageReferences } from "@/lib/planning/stage-reference";
import {
  canOverride,
  collidingWith,
  firstFreeStart,
  occupiedRange,
  type Range,
} from "@/lib/planning/stage-window";
import { getWeekDone, type DoneLine } from "@/lib/planning/week-done";
import { effectiveStageTeam, stageTeamWhere } from "@/lib/stage-team";
import { isEffectiveTeamMember } from "@/lib/stage-assignment-helpers";
import { DEFAULT_WEEKLY_HOURS } from "@/lib/planning/week-capacity";
import { weekDays } from "@/lib/planning/week-days";
import { availableStageWhere, notDiscardedStageWhere } from "@/lib/task-availability";
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

export type DayView = {
  slots: QueueSlot[];
  usedHours: number;
  nextRunnableId: string | null;
  /** O que já foi FEITO no dia: horas apontadas nele e etapas que fecharam nele. Separado dos
   *  `slots` porque são grandezas diferentes — uma é medição, a outra estimativa —, e porque o
   *  feito não se reordena: já aconteceu. */
  done: DoneLine[];
  /** Total apontado no dia, inclusive a hora sem etapa (que não cabe na lista por etapa). */
  doneHours: number;
};

export type PersonWeek = {
  userId: string;
  name: string;
  weeklyHours: number;
  usedHours: number;
  /** Horas APONTADAS na semana. Ao lado de `usedHours` e nunca somada a ela: uma é o que aconteceu,
   *  a outra o que se espera que aconteça. Um número só esconderia qual metade é chute. */
  doneHours: number;
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

/**
 * O item do poço na MESA, que é onde se programa para outra pessoa — e por isso precisa saber de
 * quem é o trabalho e quem pode recebê-lo. A tela da própria pessoa (`my-week`) usa o `PoolItem`
 * sem estes campos: lá ninguém escolhe responsável, a pessoa pega para si.
 */
export type SchedulablePoolItem = PoolItem & {
  /** A equipe EFETIVA da etapa — nula na coringa que ninguém roteou. A tela mostra de quem é o
   *  trabalho antes de perguntar para quem vai. */
  teamName: string | null;
  /** Quem pode receber esta etapa. Vem daqui e não da lista geral de pessoas porque programar para
   *  fora da equipe é o defeito que esta leitura existe para não repetir. Vazia quando a etapa não
   *  tem equipe efetiva — aí a tela cai na lista geral, porque não há regra a violar. */
  eligible: { id: string; name: string }[];
};

export type WeekPlanning = { days: string[]; people: PersonWeek[]; pool: SchedulablePoolItem[] };

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
        status: { not: "COMPLETED" },
        // Demanda descartada não ocupa dia de ninguém — ver lib/task-availability.ts.
        ...notDiscardedStageWhere(),
        ...(teamId ? { assignee: { teams: { some: { id: teamId } } } } : {}),
        OR: [
          { plannedDate: { not: null, lte: fim, ...(inicio ? { gte: inicio } : {}) } },
          // Reivindicada e SEM dia: entra na fila de HOJE por leitura, sem gravar nada. Sem isto,
          // o gestor via a semana da pessoa mais vazia do que a realidade — o trabalho puxado pelo
          // painel não estava na grade (que lê por dia) nem no poço (que exige etapa sem dono).
          // Só LIBERADA entra: etapa atribuída e ainda INACTIVE espera a anterior fechar.
          { plannedDate: null, status: "ACTIVE", ...availableStageWhere() },
        ],
      },
      select: {
        id: true,
        stageId: true,
        assigneeId: true,
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
        teamId: true,
        team: {
          select: {
            id: true,
            name: true,
            members: {
              where: { role: { not: "CLIENT" }, disabledAt: null },
              select: { id: true, name: true, email: true },
            },
          },
        },
        stage: {
          select: {
            name: true,
            defaultTeam: {
              select: {
                id: true,
                name: true,
                members: {
                  where: { role: { not: "CLIENT" }, disabledAt: null },
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
        },
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

  // O feito da semana. Sem isto a grade só mostrava o que FALTA: concluir uma etapa a apagava do
  // dia, e a carga da pessoa encolhia conforme ela entregava — quem terminou tudo na segunda
  // aparecia com a segunda vazia, e virava o candidato óbvio a receber mais.
  const feito = await getWeekDone(
    people.map((u) => u.id),
    days
  );

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
  const hojeISO = formatISODate(todayInSaoPaulo());
  const hojeNaSemana = days.includes(hojeISO) ? hojeISO : null;
  for (const row of programados) {
    if (!row.assigneeId) continue;
    // Ver o comentário no `where`: sem dia é trabalho reivindicado, e o lugar dele é a fila de
    // HOJE — só quando hoje está na semana em tela.
    const semDia = row.plannedDate === null;
    if (semDia && !hojeNaSemana) continue;
    const planejado = semDia ? (hojeNaSemana as string) : formatISODate(row.plannedDate as Date);
    // Atrasado de semanas anteriores entra no primeiro dia visível. É a rolagem da spec aplicada à
    // mesa do gestor: o item não some, aparece onde ainda dá para agir sobre ele.
    const dia = planejado < primeiroDia ? primeiroDia : planejado;
    const daPessoa = porPessoaEDia.get(row.assigneeId) ?? new Map<string, QueueItemInput[]>();
    const doDia = daPessoa.get(dia) ?? [];
    doDia.push({
      id: row.id,
      // Programar NÃO libera: só a etapa ACTIVE pode ser executada.
      available: row.status === "ACTIVE",
      semDia,
      claimedAt: row.assignedAt,
      plannedOrder: row.plannedOrder ?? 0,
      referenceHours: horasDe(row.stageId),
      referenceSource: sourceDe(row.stageId),
      scheduledStart: row.scheduledStart,
      scheduledEnd: row.scheduledEnd,
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
    let doneHours = 0;
    for (const dia of days) {
      const itens = porPessoaEDia.get(u.id)?.get(dia) ?? [];
      const fila = buildDayQueue(itens);
      const feitoNoDia = feito.hours.get(u.id)?.get(dia) ?? 0;
      byDay[dia] = {
        slots: fila.slots,
        usedHours: fila.usedHours,
        nextRunnableId: fila.nextRunnableId,
        done: feito.lines.get(u.id)?.get(dia) ?? [],
        doneHours: feitoNoDia,
      };
      usedHours += fila.usedHours;
      doneHours += feitoNoDia;
    }
    return {
      userId: u.id,
      // `name ?? email ?? id`, a convenção do projeto: sem isto, uma conta sem nome preenchido
      // deixaria a linha inteira da grade sem rótulo — e a linha é a pessoa.
      name: u.name ?? u.email ?? u.id,
      weeklyHours: u.weeklyCapacityHours ?? DEFAULT_WEEKLY_HOURS,
      usedHours,
      doneHours,
      byDay,
    };
  });

  return {
    days,
    people: peopleOut,
    pool: livres.map((l) => {
      // Roteamento da demanda substitui o padrão do modelo — a mesma regra de `lib/stage-team.ts`,
      // aqui com os membros junto para a tela poder listar só quem pode receber.
      const time = l.team ?? l.stage.defaultTeam ?? null;
      return {
        id: l.id,
        taskTitle: l.task.title,
        stageName: l.stage.name,
        clientName: l.task.project.client.name,
        teamName: time?.name ?? null,
        eligible: (time?.members ?? []).map((m) => ({
          id: m.id,
          // `name ?? email ?? id`, a convenção do projeto: conta sem nome não pode virar opção em
          // branco num select.
          name: m.name ?? m.email ?? m.id,
        })),
        referenceHours: horasDe(l.stageId),
        referenceSource: sourceDe(l.stageId),
      };
    }),
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
    select: {
      id: true,
      assigneeId: true,
      status: true,
      // O time EFETIVO e seus membros, para a validação abaixo. `teamId` é o roteamento da demanda
      // e SUBSTITUI o padrão do modelo — ver `lib/stage-team.ts`.
      teamId: true,
      team: { select: { id: true, name: true, members: { select: { id: true } } } },
      stage: {
        select: {
          defaultTeam: { select: { id: true, name: true, members: { select: { id: true } } } },
        },
      },
      plannedDate: true,
      scheduledStart: true,
      stageId: true,
      scheduledEnd: true,
    },
  });
  if (!row) return { error: t("stageNotFound") };
  if (row.status === "COMPLETED") return { error: t("completedStage") };

  // Mudar de dia derruba o compromisso: ele foi combinado PARA AQUELE DIA. Deslizar sozinho seria o
  // sistema remarcando uma locação, que é conversa com o estúdio e não `UPDATE`. Trocar só a
  // pessoa, no mesmo dia, preserva a hora — é uma das saídas do diálogo de sobreposição.
  const mudouDeDia = row.plannedDate ? formatISODate(row.plannedDate) !== input.dateISO : false;

  if (row.assigneeId && row.assigneeId !== input.userId) {
    // Transferir dentro do MESMO dia é uma das saídas do diálogo de sobreposição — a etapa muda de
    // mãos sem mudar de dia, e a hora combinada é preservada. Mudar de dia é remanejamento de
    // verdade e o lugar dele é a tela da própria etapa, que é o que a mensagem alreadyAssigned diz.
    if (!row.plannedDate || mudouDeDia) {
      return { error: t("alreadyAssigned") };
    }
  }
  // A mesa era a ÚNICA porta do sistema que não validava time: dava para programar trabalho de
  // vídeo para alguém de tráfego, e nada reclamava — enquanto o roteamento por time efetivo e o
  // caminho de conclusão já validavam. A tela explica (mostra o time e lista só quem pertence a
  // ele); esta linha garante, que é o que a tela sozinha não faz.
  if (!isEffectiveTeamMember(row, input.userId)) {
    return { error: t("notInTeam", { team: effectiveStageTeam(row)?.name ?? "" }) };
  }

  const plannedDate = new Date(`${input.dateISO}T00:00:00Z`);

  // Entra no FIM do dia: quem chega depois não fura a ordem que a pessoa já montou.
  const ultimo = await prisma.taskActiveStage.aggregate({
    where: { assigneeId: input.userId, plannedDate },
    _max: { plannedOrder: true },
  });

  const limpaJanela =
    mudouDeDia && row.scheduledStart ? { scheduledStart: null, scheduledEnd: null } : {};

  // A janela viaja junto com a etapa quando só a pessoa muda — então a agenda do DESTINO precisa
  // estar livre na faixa. Sem escape por prioridade aqui: transferir é como se RESOLVE uma
  // sobreposição, e não pode criar outra.
  const janelaQueViaja = mudouDeDia ? null : row.scheduledStart;
  if (janelaQueViaja && input.userId !== row.assigneeId) {
    const refs = await getStageReferences([row.stageId]);
    const faixa = occupiedRange({
      scheduledStart: janelaQueViaja,
      scheduledEnd: row.scheduledEnd,
      referenceHours: refs.get(row.stageId)?.hours ?? 0,
    }) as Range;

    const doDestino = await prisma.taskActiveStage.findMany({
      where: {
        assigneeId: input.userId,
        plannedDate: row.plannedDate,
        scheduledStart: { not: null },
        status: { not: "COMPLETED" },
      },
      select: {
        id: true,
        stageId: true,
        scheduledStart: true,
        scheduledEnd: true,
        task: { select: { title: true } },
        stage: { select: { name: true } },
      },
    });
    const refsDestino = await getStageReferences(doDestino.map((d) => d.stageId));
    const ocupadas = doDestino.flatMap((d) => {
      const range = occupiedRange({
        scheduledStart: d.scheduledStart,
        scheduledEnd: d.scheduledEnd,
        referenceHours: refsDestino.get(d.stageId)?.hours ?? 0,
      });
      return range ? [{ ...d, range }] : [];
    });
    if (collidingWith(faixa, ocupadas).length > 0) return { error: t("windowBusyPerson") };
  }

  try {
    await prisma.taskActiveStage.update({
      where: { id: input.activeStageId },
      data: {
        assigneeId: input.userId,
        plannedDate,
        plannedOrder: (ultimo._max.plannedOrder ?? 0) + 1,
        ...limpaJanela,
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
      data: {
        plannedDate: null,
        plannedOrder: null,
        assigneeId: null,
        // A janela sai junto: ela é um compromisso PARA AQUELE DIA e AQUELA pessoa. Deixá-la para
        // trás faz a etapa voltar do poço já agendada num horário que ninguém marcou.
        scheduledStart: null,
        scheduledEnd: null,
      },
    });
  } catch (error) {
    console.error("unscheduleStage error:", error);
    return { error: t("scheduleFailed") };
  }

  revalidatePath("/planning/week");
  return { success: true as const };
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "14:00" no relógio de São Paulo → instante real, ancorado no dia de `plannedDate`.
 *
 *  `plannedDate` guarda meia-noite SP codificada em UTC, então `formatISODate` devolve o dia SP
 *  direto. Montar o instante em cima dele é o que torna o invariante ESTRUTURAL: não existe caminho
 *  para gravar um compromisso num dia diferente da coluna em que o item está. */
function instanteNoDia(plannedDate: Date, hhmm: string): Date {
  return realInstant(new Date(`${formatISODate(plannedDate)}T${hhmm}:00.000Z`));
}

/**
 * Marca (ou desmarca) o compromisso de uma etapa já programada.
 *
 * Não recebe data de propósito — ver `instanteNoDia`. `startTime` nulo limpa os dois campos: uma
 * janela com fim e sem começo não significa nada.
 */
export type WindowOccupant = {
  activeStageId: string;
  taskTitle: string;
  stageName: string;
  priority: TaskPriority;
  /** Instantes reais, em ISO — a tela formata no fuso de SP. */
  startISO: string;
  endISO: string;
};
export type WindowOverlap = {
  occupants: WindowOccupant[];
  /** A prioridade autoriza ocupar o horário? Quando falso, a tela só oferece as saídas que não
   *  tocam na ocupante. */
  canOverride: boolean;
  /** Para onde a ocupante iria se o gestor escolher "adiar" — já pulando terceiros. */
  firstFreeStartISO: string;
};

export async function setStageWindow(input: {
  activeStageId: string;
  startTime: string | null;
  endTime?: string | null;
}) {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: input.activeStageId },
    select: {
      id: true,
      assigneeId: true,
      status: true,
      stageId: true,
      plannedDate: true,
      task: { select: { priority: true, title: true } },
      stage: { select: { name: true } },
    },
  });
  if (!row) return { error: t("stageNotFound") };

  if (input.startTime === null) {
    await prisma.taskActiveStage.update({
      where: { id: input.activeStageId },
      data: { scheduledStart: null, scheduledEnd: null },
    });
    revalidatePath("/planning/week");
    return { success: true as const };
  }

  if (row.status === "COMPLETED") return { error: t("completedStage") };
  // O dia é a âncora da hora: sem ele o compromisso não tem onde existir, e o item nem está numa
  // coluna da grade.
  if (!row.plannedDate) return { error: t("windowNeedsDay") };
  if (!HORA.test(input.startTime)) return { error: t("invalidTime") };
  if (input.endTime && !HORA.test(input.endTime)) return { error: t("invalidTime") };

  const inicio = instanteNoDia(row.plannedDate as Date, input.startTime);
  const fim = input.endTime ? instanteNoDia(row.plannedDate as Date, input.endTime) : null;

  // Duração zero não ocuparia nada e a trava de sobreposição viraria decorativa para esta linha.
  if (fim && fim.getTime() <= inicio.getTime()) return { error: t("windowEndBeforeStart") };

  // As outras janelas DESTA pessoa NESTE dia. `id: { not: … }` porque remarcar um compromisso
  // existente colidiria com ele próprio.
  const outras = await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: row.assigneeId,
      plannedDate: row.plannedDate,
      scheduledStart: { not: null },
      id: { not: row.id },
      status: { not: "COMPLETED" },
    },
    select: {
      id: true,
      stageId: true,
      scheduledStart: true,
      scheduledEnd: true,
      task: { select: { priority: true, title: true } },
      stage: { select: { name: true } },
    },
  });

  // A referência da etapa fecha a faixa de quem não declarou fim — a da nova inclusive.
  const refs = await getStageReferences([row.stageId, ...outras.map((o) => o.stageId)]);
  const horasDe = (stageId: string) => refs.get(stageId)?.hours ?? 0;

  const faixaNova = occupiedRange({
    scheduledStart: inicio,
    scheduledEnd: fim,
    referenceHours: horasDe(row.stageId),
  }) as Range;

  const ocupadas = outras.flatMap((o) => {
    const range = occupiedRange({
      scheduledStart: o.scheduledStart,
      scheduledEnd: o.scheduledEnd,
      referenceHours: horasDe(o.stageId),
    });
    return range ? [{ ...o, range }] : [];
  });

  const batidas = collidingWith(faixaNova, ocupadas);
  if (batidas.length > 0) {
    // Autoriza se vence TODAS: passar por cima de uma e ignorar a outra deixaria uma sobreposição
    // gravada, que é o que esta trava existe para impedir.
    const autoriza = batidas.every((b) => canOverride(row.task.priority, b.task.priority));
    const duracaoDaOcupante = batidas[0].range.end.getTime() - batidas[0].range.start.getTime();
    return {
      overlap: {
        canOverride: autoriza,
        occupants: batidas.map((b) => ({
          activeStageId: b.id,
          taskTitle: b.task.title,
          stageName: b.stage.name,
          priority: b.task.priority,
          startISO: b.range.start.toISOString(),
          endISO: b.range.end.toISOString(),
        })),
        firstFreeStartISO: firstFreeStart(
          faixaNova.end,
          duracaoDaOcupante,
          ocupadas.map((o) => o.range)
        ).toISOString(),
      },
    };
  }

  await prisma.taskActiveStage.update({
    where: { id: input.activeStageId },
    data: { scheduledStart: inicio, scheduledEnd: fim },
  });

  revalidatePath("/planning/week");
  return { success: true as const };
}

/**
 * Para as duas saídas de troca de colaborador: quem, no time EFETIVO da etapa, pode receber um
 * compromisso naquela faixa.
 *
 * Devolve todo mundo do time com a marca `busy` em vez de esconder os ocupados — sumir da lista não
 * se distingue de "não é do time", e o gestor precisa saber que a pessoa existe e está comprometida.
 */
export async function listWindowCandidates(
  activeStageId: string
): Promise<{ error: string } | { candidates: { id: string; name: string; busy: boolean }[] }> {
  await requireManagerOrAdmin();
  const t = await getTranslations("errors.weekPlanning");

  const row = await prisma.taskActiveStage.findUnique({
    where: { id: activeStageId },
    select: {
      id: true,
      assigneeId: true,
      stageId: true,
      plannedDate: true,
      scheduledStart: true,
      scheduledEnd: true,
      teamId: true,
      team: {
        select: {
          id: true,
          name: true,
          members: { select: { id: true, name: true, email: true } },
        },
      },
      stage: {
        select: {
          name: true,
          defaultTeam: {
            select: {
              id: true,
              name: true,
              members: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  });
  if (!row || !row.scheduledStart || !row.plannedDate) return { error: t("stageNotFound") };

  const refs = await getStageReferences([row.stageId]);
  const faixa = occupiedRange({
    scheduledStart: row.scheduledStart,
    scheduledEnd: row.scheduledEnd,
    referenceHours: refs.get(row.stageId)?.hours ?? 0,
  }) as Range;

  const membros = (row.teamId ? row.team?.members : row.stage.defaultTeam?.members) ?? [];

  // Ver `getWeekPlanning`: uma consulta para todo o time, nunca uma por pessoa.
  const agendasDoDia = await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: { in: membros.map((m) => m.id) },
      plannedDate: row.plannedDate,
      scheduledStart: { not: null },
      status: { not: "COMPLETED" },
      id: { not: row.id },
    },
    select: {
      id: true,
      stageId: true,
      assigneeId: true,
      scheduledStart: true,
      scheduledEnd: true,
    },
  });
  const refsOutras = await getStageReferences(agendasDoDia.map((a) => a.stageId));

  return {
    candidates: membros.map((m) => {
      const ocupadas = agendasDoDia
        .filter((a) => a.assigneeId === m.id)
        .flatMap((a) => {
          const range = occupiedRange({
            scheduledStart: a.scheduledStart,
            scheduledEnd: a.scheduledEnd,
            referenceHours: refsOutras.get(a.stageId)?.hours ?? 0,
          });
          return range ? [{ id: a.id, range }] : [];
        });
      return {
        id: m.id,
        // `name ?? email ?? id`, a convenção do projeto: sem isto, uma conta sem nome preenchido
        // deixaria a linha da lista sem rótulo — e a linha é a pessoa.
        name: m.name ?? m.email ?? m.id,
        busy: collidingWith(faixa, ocupadas).length > 0,
      };
    }),
  };
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
