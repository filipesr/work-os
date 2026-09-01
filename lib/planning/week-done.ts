import "server-only";

import prisma from "@/lib/prisma";
import { formatISODate, nowInSaoPaulo, realInstant } from "@/lib/dates";

/**
 * O que já foi FEITO na semana, por pessoa e por dia.
 *
 * As duas telas de semana — a mesa do gestor e a da própria pessoa — filtravam `status: not
 * COMPLETED`, então concluir uma etapa a apagava do dia. A carga da pessoa ENCOLHIA conforme ela
 * entregava: quem terminou tudo na segunda aparecia com a segunda vazia, e virava o candidato
 * óbvio a receber mais. O mesmo defeito que a carga por cliente tinha, nas duas telas onde a
 * distribuição de fato acontece.
 *
 * A regra de qual dia é a da carga por cliente e a da linha do tempo, e é uma só: **a hora cai no
 * dia em que foi apontada, e o `✓` no dia em que a etapa fechou**. Uma etapa programada para
 * segunda e concluída na quarta some da segunda — e é isso mesmo: a segunda passa a mostrar
 * "previsto 6h, feito 0h", que denuncia o atraso melhor do que arrastar o cartão de lugar.
 *
 * Vive aqui, e não em cada leitura, porque as duas telas precisam do MESMO número: a pessoa não
 * pode ver da própria semana algo diferente do que o gestor vê dela.
 */

export type DoneLine = {
  /** `TemplateStage.id` — a linha é por etapa, e uma etapa aparece uma vez por dia. */
  stageId: string;
  taskId: string;
  taskTitle: string;
  stageName: string;
  /** Horas APONTADAS naquele dia. Medição, nunca referência: o passado não se estima. */
  hours: number;
  /** A etapa FECHOU neste dia. Sem horas apontadas, a linha ainda existe — é um fato do trabalho —,
   *  e conta zero: preencher com estimativa seria fabricar histórico. */
  completed: boolean;
};

/** userId → dia (ISO SP) → linhas. */
export type DoneByPersonDay = Map<string, Map<string, DoneLine[]>>;

type LogRow = {
  userId: string;
  taskId: string;
  stageId: string | null;
  hoursSpent: number;
  logDate: Date;
  task: { title: string };
};

type CompletionRow = {
  assigneeId: string | null;
  taskId: string;
  stageId: string;
  completedAt: Date | null;
  task: { title: string };
  stage: { name: string };
};

/** Puro, para o teste alcançar a regra sem banco. */
export function mergeDone(
  logs: LogRow[],
  completions: CompletionRow[],
  days: readonly string[],
  stageNames: ReadonlyMap<string, string>
): DoneByPersonDay {
  const out: DoneByPersonDay = new Map();
  const naSemana = new Set(days);

  const linha = (userId: string, dia: string, stageId: string, taskId: string): DoneLine => {
    const daPessoa = out.get(userId) ?? new Map<string, DoneLine[]>();
    out.set(userId, daPessoa);
    const doDia = daPessoa.get(dia) ?? [];
    daPessoa.set(dia, doDia);
    const existente = doDia.find((l) => l.stageId === stageId && l.taskId === taskId);
    if (existente) return existente;
    const nova: DoneLine = {
      stageId,
      taskId,
      taskTitle: "",
      stageName: stageNames.get(stageId) ?? "",
      hours: 0,
      completed: false,
    };
    doDia.push(nova);
    return nova;
  };

  for (const l of logs) {
    // Hora lançada na demanda inteira (`stageId: null`) não tem etapa a que pertencer, e esta grade
    // é por etapa. Ela conta no total do dia, somada fora daqui — ver `doneHoursOf`.
    if (!l.stageId) continue;
    const dia = formatISODate(nowInSaoPaulo(l.logDate));
    if (!naSemana.has(dia)) continue;
    const item = linha(l.userId, dia, l.stageId, l.taskId);
    item.hours += l.hoursSpent;
    item.taskTitle = l.task.title;
  }

  for (const c of completions) {
    if (!c.assigneeId || !c.completedAt) continue;
    const dia = formatISODate(nowInSaoPaulo(c.completedAt));
    if (!naSemana.has(dia)) continue;
    const item = linha(c.assigneeId, dia, c.stageId, c.taskId);
    item.completed = true;
    item.taskTitle = c.task.title;
    item.stageName = c.stage.name;
  }

  // Ordem estável: a etapa que fechou primeiro no dia, depois as demais por título. Sem isto, dois
  // carregamentos da mesma célula podiam listar em ordens diferentes.
  for (const daPessoa of out.values()) {
    for (const doDia of daPessoa.values()) {
      doDia.sort(
        (a, b) =>
          Number(b.completed) - Number(a.completed) ||
          a.taskTitle.localeCompare(b.taskTitle) ||
          a.stageName.localeCompare(b.stageName)
      );
    }
  }
  return out;
}

/** Total apontado por (pessoa, dia) — inclui a hora SEM etapa, que não cabe na lista por etapa mas
 *  é hora de trabalho igual. Sem ela, o número do dia mentiria para menos. */
export function doneHoursOf(
  logs: LogRow[],
  days: readonly string[]
): Map<string, Map<string, number>> {
  const naSemana = new Set(days);
  const out = new Map<string, Map<string, number>>();
  for (const l of logs) {
    const dia = formatISODate(nowInSaoPaulo(l.logDate));
    if (!naSemana.has(dia)) continue;
    const daPessoa = out.get(l.userId) ?? new Map<string, number>();
    daPessoa.set(dia, (daPessoa.get(dia) ?? 0) + l.hoursSpent);
    out.set(l.userId, daPessoa);
  }
  return out;
}

/**
 * Lê o feito da semana para um conjunto de pessoas.
 *
 * As bordas são PRÓPRIAS e convertidas com `realInstant`: `logDate` e `completedAt` são instantes
 * REAIS, e compará-los contra a meia-noite SP-local erraria em três horas — o erro só aparece na
 * borda do dia (uma conclusão de sábado às 22h em São Paulo vira domingo em UTC e sumiria).
 */
export async function getWeekDone(
  userIds: string[],
  days: readonly string[]
): Promise<{ lines: DoneByPersonDay; hours: Map<string, Map<string, number>> }> {
  if (userIds.length === 0 || days.length === 0) {
    return { lines: new Map(), hours: new Map() };
  }
  const inicio = realInstant(new Date(`${days[0]}T00:00:00Z`));
  const fim = realInstant(new Date(Date.parse(`${days[days.length - 1]}T00:00:00Z`) + 86_400_000));

  const [logs, completions] = await Promise.all([
    prisma.timeLog.findMany({
      where: { userId: { in: userIds }, logDate: { gte: inicio, lt: fim } },
      select: {
        userId: true,
        taskId: true,
        stageId: true,
        hoursSpent: true,
        logDate: true,
        task: { select: { title: true } },
      },
    }),
    prisma.taskActiveStage.findMany({
      where: {
        assigneeId: { in: userIds },
        status: "COMPLETED",
        completedAt: { gte: inicio, lt: fim },
      },
      select: {
        assigneeId: true,
        taskId: true,
        stageId: true,
        completedAt: true,
        task: { select: { title: true } },
        stage: { select: { name: true } },
      },
    }),
  ]);

  // O nome da etapa das linhas que vieram só do apontamento: o `TimeLog` guarda o `stageId`, não o
  // nome. Uma consulta a mais, em lote, só para os ids que a conclusão não trouxe.
  const semNome = [
    ...new Set(
      logs
        .map((l) => l.stageId)
        .filter((id): id is string => !!id && !completions.some((c) => c.stageId === id))
    ),
  ];
  const nomes = semNome.length
    ? await prisma.templateStage.findMany({
        where: { id: { in: semNome } },
        select: { id: true, name: true },
      })
    : [];

  return {
    lines: mergeDone(logs, completions, days, new Map(nomes.map((n) => [n.id, n.name]))),
    hours: doneHoursOf(logs, days),
  };
}
