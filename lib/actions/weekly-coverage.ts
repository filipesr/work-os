"use server";

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { formatISODate } from "@/lib/dates";
import { weekSlots, windowRange, weekIndexOf } from "@/lib/calendar/weekly-window";
import type { OccurrenceKind, TaskStatus } from "@prisma/client";
import { demandState, type DemandState } from "@/lib/calendar/demand-state";

export interface CoverageClient {
  id: string;
  name: string;
}

/** Resumo de uma demanda vinculada a uma data — o suficiente para o card
 *  mostrar a tag e o modal explicar do que se trata, sem abrir a tarefa. */
export interface OccurrenceTask {
  id: string;
  title: string;
  clientName: string;
  projectName: string;
  status: TaskStatus;
  dueDateIso: string | null;
  /** Quem responde pelas etapas EM CURSO. Lista porque a demanda pode ter mais de uma etapa ativa,
   *  e nesse caso ela é das duas — escolher uma seria esconder metade do trabalho. Vazia quando não
   *  há etapa ativa; é a tela que decide como dizer isso. */
  assigneeNames: string[];
  /** Posição em relação ao PLANO (entregue / atrasada / em risco / …). Diferente
   *  de `status`, que diz onde a demanda está no fluxo. É esta leitura que faz a
   *  demanda concluída aparecer como boa notícia em vez de sumir. */
  state: DemandState;
}

export interface WeekOccurrence {
  id: string;
  iso: string;
  titlePt: string;
  titleEs: string;
  kind: OccurrenceKind;
  source: "CURATED" | "CUSTOM";
  /** Clientes com demanda VINCULADA a esta data específica. */
  linkedClients: number;
  tasks: OccurrenceTask[];
}

export interface WeekCoverage {
  key: string; // segunda, YYYY-MM-DD
  startIso: string;
  endIso: string;
  /** Datas do calendário que caem nesta semana — contexto, não a chave. */
  occurrences: WeekOccurrence[];
  /** Clientes com pelo menos uma demanda vencendo na semana. */
  withDemand: CoverageClient[];
  /** Clientes ativos SEM nenhuma demanda na semana — o sinal de ociosidade. */
  idle: CoverageClient[];
  /** Demandas da semana SEM vínculo com data. São a maior parte do trabalho —
   *  sem elas o card mostrava só a agenda sazonal e escondia a operação. */
  unlinked: OccurrenceTask[];
}

export interface WeeklyCoverage {
  weeks: WeekCoverage[];
  activeClients: CoverageClient[];
  /** Clientes sem NENHUMA demanda na janela inteira — ociosidade sustentada,
   *  que é diferente de ter uma semana vazia. */
  idleAllWindow: CoverageClient[];
}

/**
 * Cobertura semanal: para cada semana da janela, quais clientes têm demanda e
 * quais não têm.
 *
 * O eixo é o CLIENTE, não a data. Uma data comemorativa sem demanda é um aviso;
 * um cliente sem demanda nenhuma por 12 semanas é um problema comercial — e o
 * segundo não depende de existir feriado na semana.
 *
 * "Tem demanda" = tarefa com `dueDate` na semana. É a leitura de PLANEJAMENTO
 * (o que está agendado), não de entrega. Um cliente pode ter agenda cheia e nada
 * entregue; são perguntas diferentes e não devem se confundir numa célula só.
 */
export async function getWeeklyCoverage(weeks: number): Promise<WeeklyCoverage> {
  await requireManagerOrAdmin();

  const slots = weekSlots(weeks);
  const range = windowRange(slots);
  // Um instante só para a página inteira. Recalcular `new Date()` por linha faria
  // duas demandas idênticas caírem em estados diferentes se o render atravessasse
  // a meia-noite — raro, e impossível de reproduzir depois.
  const agora = new Date();

  const [clients, tasks, occurrences] = await Promise.all([
    // Cliente ativo = tem projeto ativo. Sem isso, um cliente arquivado
    // apareceria ocioso para sempre e afogaria o sinal real.
    prisma.client.findMany({
      where: { projects: { some: { status: "ACTIVE" } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.task.findMany({
      where: {
        dueDate: { gte: range.start, lte: range.end },
        // Cancelada/obsoleta não é agenda: contá-las mostraria cobertura onde
        // não há trabalho previsto.
        status: { notIn: ["CANCELLED", "OBSOLETE"] },
      },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        plannedStartAt: true,
        startedAt: true,
        completedAt: true,
        calendarOccurrenceId: true,
        activeStages: {
          where: { status: "ACTIVE" },
          orderBy: { stage: { order: "asc" } },
          select: {
            assignee: { select: { name: true, email: true } },
            team: { select: { name: true } },
            stage: { select: { defaultTeam: { select: { name: true } } } },
          },
        },
        project: { select: { name: true, clientId: true, client: { select: { name: true } } } },
      },
    }),
    prisma.calendarOccurrence.findMany({
      where: { date: { gte: range.start, lte: range.end } },
      orderBy: [{ date: "asc" }, { titlePt: "asc" }],
      select: {
        id: true,
        date: true,
        titlePt: true,
        titleEs: true,
        kind: true,
        source: true,
        tasks: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            status: true,
            dueDate: true,
            plannedStartAt: true,
            startedAt: true,
            completedAt: true,
            activeStages: {
              where: { status: "ACTIVE" },
              orderBy: { stage: { order: "asc" } },
              select: {
                assignee: { select: { name: true, email: true } },
                team: { select: { name: true } },
                stage: { select: { defaultTeam: { select: { name: true } } } },
              },
            },
            project: {
              select: { name: true, clientId: true, client: { select: { name: true } } },
            },
          },
        },
      },
    }),
  ]);

  /**
   * Quem responde pela demanda: o dono de cada etapa EM CURSO.
   *
   * Antes daqui esta tela lia `Task.assignee` — o responsável no nível da DEMANDA. Neste sistema a
   * atribuição é por ETAPA, e o campo da demanda não é escrito por caminho nenhum do fluxo: a tela
   * dizia "sem responsável" para toda demanda que existe, sempre. Não era caso de borda, era
   * informação que nunca esteve certa.
   *
   * A cadeia de recurso é a mesma da carga por cliente e da linha do tempo — pessoa, equipe da
   * etapa, equipe padrão do modelo —, porque quando ninguém pegou a etapa quem responde por ela
   * ainda é alguém: a equipe. Sem os dois, a lista vem vazia e a tela diz "sem responsável" com
   * razão pela primeira vez.
   */
  const responsaveis = (t: {
    activeStages: {
      assignee: { name: string | null; email: string | null } | null;
      team: { name: string } | null;
      stage: { defaultTeam: { name: string } | null };
    }[];
  }): string[] => {
    const nomes = t.activeStages.map(
      (a) => a.assignee?.name ?? a.assignee?.email ?? a.team?.name ?? a.stage.defaultTeam?.name
    );
    // A mesma pessoa em duas etapas ativas é uma pessoa só na leitura.
    return [...new Set(nomes.filter((n): n is string => !!n))];
  };

  // clientes com demanda, por índice de semana + as demandas sem vínculo
  const byWeek: Set<string>[] = slots.map(() => new Set<string>());
  const unlinkedByWeek: OccurrenceTask[][] = slots.map(() => []);
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const i = weekIndexOf(slots, t.dueDate);
    if (i < 0) continue;
    byWeek[i].add(t.project.clientId);
    // As vinculadas já aparecem sob a sua data; repeti-las aqui duplicaria.
    if (t.calendarOccurrenceId) continue;
    unlinkedByWeek[i].push({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDateIso: formatISODate(t.dueDate),
      assigneeNames: responsaveis(t),
      clientName: t.project.client.name,
      projectName: t.project.name,
      state: demandState(t, agora),
    });
  }

  const occByWeek: WeekOccurrence[][] = slots.map(() => []);
  for (const o of occurrences) {
    const i = weekIndexOf(slots, o.date);
    if (i < 0) continue;
    occByWeek[i].push({
      id: o.id,
      iso: formatISODate(o.date),
      titlePt: o.titlePt,
      titleEs: o.titleEs,
      kind: o.kind,
      source: o.source,
      linkedClients: new Set(o.tasks.map((t) => t.project.clientId)).size,
      tasks: o.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueDateIso: t.dueDate ? formatISODate(t.dueDate) : null,
        assigneeNames: responsaveis(t),
        clientName: t.project.client.name,
        projectName: t.project.name,
        state: demandState(t, agora),
      })),
    });
  }

  const weeksOut: WeekCoverage[] = slots.map((s, i) => ({
    key: s.key,
    startIso: formatISODate(s.start),
    endIso: formatISODate(s.end),
    occurrences: occByWeek[i],
    withDemand: clients.filter((c) => byWeek[i].has(c.id)),
    idle: clients.filter((c) => !byWeek[i].has(c.id)),
    unlinked: unlinkedByWeek[i],
  }));

  const anyWeek = new Set<string>();
  for (const set of byWeek) for (const id of set) anyWeek.add(id);

  return {
    weeks: weeksOut,
    activeClients: clients,
    idleAllWindow: clients.filter((c) => !anyWeek.has(c.id)),
  };
}
