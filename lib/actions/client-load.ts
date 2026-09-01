"use server";

import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import {
  formatISODate,
  mondayOfWeek,
  nowInSaoPaulo,
  realInstant,
  todayInSaoPaulo,
} from "@/lib/dates";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { projectDemandDays } from "@/lib/planning/demand-projection";
import { weekDays } from "@/lib/planning/week-days";
import {
  availableStageWhere,
  availableTaskWhere,
  notDiscardedStageWhere,
} from "@/lib/task-availability";
import {
  checkStalled,
  idleDays,
  sortStalled,
  stalledSince,
  type StalledItem,
} from "@/lib/planning/stalled-demand";

/**
 * A semana pelo eixo do cliente: o que já foi FEITO e o que ainda está por fazer.
 *
 * Leitura pura, sem nenhuma escrita: quem redistribui é a mesa. Um segundo lugar que também
 * escrevesse seria um segundo lugar para as duas divergirem.
 *
 * Aqui a pergunta é outra que a da mesa, e por isso o filtro é outro. A mesa responde "o que falta
 * fazer", então esconde o concluído. Esta tela responde "quanto desta semana este cliente ocupou",
 * e sem o concluído a leitura se inverte: a carga ENCOLHE conforme a semana avança, e quem mais
 * entregou aparece como quem menos ocupou.
 *
 * O feito é o APONTAMENTO (`TimeLog`) do dia, não a referência da etapa concluída: com o
 * apontamento obrigatório em vigor, o realizado passa a ser medido, não estimado. O pendente é a
 * referência menos o que já foi apontado na janela, nunca negativo. Etapa concluída SEM
 * apontamento conta ZERO — preencher o passado com estimativa seria fabricar histórico.
 *
 * As três grandezas — referência, realizado e pendente — são hora de TRABALHO, e por isso a
 * subtração "referência − realizado" fecha. Antes não fechava: a referência (`getStageReferences`)
 * media tempo de RELÓGIO (`completedAt − startedAt` da etapa), e uma etapa aberta a noite toda sem
 * ninguém mexer inflava a mesma referência que o apontamento, em hora de trabalho, tentava
 * descontar. Uma correção anterior trocou a fonte da referência para o próprio `TimeLog` — datas
 * diferentes da mesma unidade, não mais grandezas diferentes disputando o mesmo número.
 *
 * Etapa não liberada aparece na lista E SOMA — e esta é a única divergência deliberada em relação
 * à mesa do gestor. A regra "não liberada não soma" nasceu lá, onde a pergunta é "o que dá para
 * fazer AGORA": naquela mesa, trabalho travado não consome a capacidade de hoje. Aqui a pergunta é
 * outra — "quanto desta semana este cliente ocupa" — e a projeção existe justamente para mostrar o
 * que VEM. Como toda etapa futura é, por definição, ainda não liberada (numa cadeia sequencial só a
 * primeira é ACTIVE; as seguintes ficam INACTIVE até a anterior fechar), manter a regra da mesa
 * aqui zeraria o futuro inteiro — que é a feature. O cabeçalho diria "0h" com nove horas
 * projetadas logo abaixo dele.
 *
 * O `state` de cada etapa continua sendo devolvido como está (`waiting` segue `waiting`), para a
 * tela distinguir o que já pode começar do que ainda espera: o que muda é só a SOMA.
 */

/** Uma etapa dentro do bloco da demanda, na ordem sequencial do fluxo. */
export type StageLine = {
  id: string;
  stageOrder: number;
  stageName: string;
  assigneeName: string | null;
  /** O número que a linha exibe. No encaixe RETROSPECTIVO (dia em que a etapa foi trabalhada, e o
   *  dia em que fechou) é o APONTAMENTO daquele dia — medição. Só no dia projetado é o pendente,
   *  derivado da referência. Sem essa distinção, uma etapa aberta encaixada em três dias passados
   *  mostrava o mesmo pendente nos três, e quem lia a coluna de segunda lia "2h" onde a pessoa fez
   *  1h: estimativa disfarçada de medição, no lugar em que a tela promete medição. */
  hours: number;
  /** Horas APONTADAS desta etapa no dia da célula. Zero quando ninguém apontou — o passado não é
   *  preenchido com estimativa. */
  doneHours: number;
  /** O número em `hours` É a referência declarada (SLA), não medição — a tela avisa com `~`. Falso
   *  quando `hours` traz apontamento, ainda que a referência da etapa seja declarada: a marca fala
   *  sobre o NÚMERO EXIBIDO, e pôr `~` ao lado de uma hora medida seria mentir sobre ela. */
  estimated: boolean;
  /** `done` = concluída; `pending` = ativa ou na fila; `waiting` = ainda não liberada. As três
   *  somam o pendente nesta tela — ver o cabeçalho do arquivo; `state` só diz o que já pode
   *  começar. */
  state: "done" | "pending" | "waiting";
};

/** Um bloco por demanda dentro da célula do dia. */
export type TaskBlock = {
  taskId: string;
  projectName: string;
  taskTitle: string;
  /** Prazo da demanda, para explicar o empilhamento — `null` quando não há vencimento definido. */
  dueDateISO: string | null;
  /** O prazo já passou e a demanda não fechou. Justifica etapas empilhadas em hoje. */
  overdue: boolean;
  /** Soma do `doneHours` das etapas DESTE bloco — o apontamento que caiu no dia em que o bloco
   *  está posicionado. A etapa aparece também nos dias em que foi trabalhada (não só no dia
   *  projetado ou concluído), e o realizado do dia só conta etapas que esta leitura enxerga, então
   *  esta soma, somada entre os blocos do cliente, bate com `ClientDay.doneHours` do mesmo dia. */
  doneHours: number;
  pendingHours: number;
  stages: StageLine[];
};

export type ClientDay = {
  /** Apontamento do cliente neste dia, somado direto do `TimeLog` — mas SÓ das etapas que esta
   *  leitura enxerga (as que passaram pelos filtros, `?team=` inclusive). Não é a soma dos
   *  `TaskBlock.doneHours` dos blocos exibidos aqui, e sim a mesma matéria-prima deles: a etapa
   *  aparece também no dia em que foi trabalhada (além do dia projetado/concluído, e mesmo quando o
   *  dia projetado cai fora da semana em exibição), então os dois números batem. */
  doneHours: number;
  pendingHours: number;
  tasks: TaskBlock[];
};

export type ClientWeek = {
  clientId: string;
  clientName: string;
  totalDone: number;
  totalPending: number;
  byDay: Record<string, ClientDay>;
  /** O que ninguém pegou nem marcou, já ordenado por urgência. */
  stalled: StalledItem[];
  /** Soma das horas paradas. FORA de `totalDone`/`totalPending` de propósito: o total responde
   *  "quanto desta semana este cliente ocupou", e trabalho parado não ocupou nada. */
  stalledHours: number;
};

export type ClientLoad = { days: string[]; clients: ClientWeek[] };

export async function getClientLoad(mondayISO: string, teamId?: string): Promise<ClientLoad> {
  await requireManagerOrAdmin();

  const days = weekDays(mondayISO);
  const fim = new Date(`${days[5]}T23:59:59Z`);
  const semanaCorrente = formatISODate(mondayOfWeek(todayInSaoPaulo()));
  const inicio = days[0] > semanaCorrente ? new Date(`${days[0]}T00:00:00Z`) : null;
  // `completedAt` é instante REAL (gravado com `new Date()`), e não a representação SP-local que
  // `plannedDate` usa. Comparar as duas convenções erra em três horas e some com o que foi
  // concluído à noite — ver `realInstant` em lib/dates.ts.
  const inicioReal = realInstant(new Date(`${days[0]}T00:00:00Z`));
  const fimReal = realInstant(fim);

  const linhas = await prisma.taskActiveStage.findMany({
    where: {
      // Demanda descartada não ocupa dia de ninguém — ver lib/task-availability.ts.
      ...notDiscardedStageWhere(),
      ...(teamId ? { assignee: { teams: { some: { id: teamId } } } } : {}),
      OR: [
        // 1. Programada para a semana e ainda não concluída.
        {
          status: { not: "COMPLETED" },
          plannedDate: { not: null, lte: fim, ...(inicio ? { gte: inicio } : {}) },
        },
        // 2. Reivindicada e SEM dia: entra na fila de HOJE, como na mesa e na tela da pessoa.
        //    `assigneeId` não nulo porque sem dono não é trabalho reivindicado, é fila.
        {
          status: "ACTIVE",
          plannedDate: null,
          assigneeId: { not: null },
          ...availableStageWhere(),
        },
        // 3. CONCLUÍDA na semana — o que dá a percepção do executado. Posicionada pelo dia em que
        //    foi concluída, que é o dia em que o cliente de fato consumiu a agência.
        { status: "COMPLETED", completedAt: { gte: inicioReal, lte: fimReal } },
      ],
    },
    select: {
      id: true,
      stageId: true,
      status: true,
      plannedDate: true,
      completedAt: true,
      task: {
        select: {
          id: true,
          title: true,
          dueDate: true,
          // Vencida é "prazo passou E a demanda não fechou" — sem o status, a demanda entregue com
          // atraso continuava vermelha para sempre.
          status: true,
          project: { select: { name: true, client: { select: { id: true, name: true } } } },
        },
      },
      stage: {
        select: {
          name: true,
          order: true,
          defaultTeam: { select: { name: true } },
          // Os PRÉ-REQUISITOS da etapa vivem em `dependents` — em `TemplateStage`, o campo com nome
          // intuitivo (`dependencies`) é a relação INVERSA. Ver o comentário no schema: ler o lado
          // errado já custou um bug em que concluir a primeira etapa ativava a última.
          dependents: { select: { dependsOnStageId: true } },
        },
      },
      team: { select: { name: true } },
      assignee: { select: { name: true, email: true } },
    },
    // A ordem das ETAPAS dentro do bloco é a do fluxo: quem lê a célula lê a demanda andando.
    orderBy: [{ stage: { order: "asc" } }, { id: "asc" }],
  });

  // As ETAPAS QUE FALTAM das demandas já em tela: TODAS as não concluídas que a primeira consulta
  // não trouxe. Sem elas a célula mostra só o pedaço que tem data e o gestor não vê o tamanho do
  // que ainda vem — a leitura fecha a demanda inteira ou não fecha nada.
  //
  // "Todas" inclui as marcadas para DEPOIS da janela. Enquanto esta consulta exigia
  // `plannedDate: null`, uma etapa marcada para a segunda que vem não caía nem aqui nem no ramo 1
  // (`plannedDate <= fim`): sumia do mapa da projeção, e `obterDia` a tratava como "não faz parte
  // da demanda: nenhuma restrição" — a dependente dela aparecia NESTA semana, antes do
  // pré-requisito que só acontece na próxima. Quem decide o que aparece é a projeção, que já sabe
  // descartar o que não cabe na semana (`days.includes`); a consulta não pode decidir isso por ela.
  //
  // O recorte por `id` desduplica o que a primeira consulta já trouxe — sem ele a mesma etapa
  // entraria duas vezes na projeção e no bloco.
  //
  // Consulta separada porque ela depende das demandas que a primeira encontrou: fundir as duas
  // exigiria um OR com subconsulta, mais caro de ler e de manter que uma ida a mais ao banco.
  const idsEmTela = [...new Set(linhas.map((l) => l.task.id))];
  const restantes = idsEmTela.length
    ? await prisma.taskActiveStage.findMany({
        where: {
          taskId: { in: idsEmTela },
          status: { notIn: ["COMPLETED"] },
          id: { notIn: linhas.map((l) => l.id) },
        },
        select: {
          id: true,
          stageId: true,
          status: true,
          plannedDate: true,
          completedAt: true,
          task: {
            select: {
              id: true,
              title: true,
              dueDate: true,
              status: true,
              project: { select: { name: true, client: { select: { id: true, name: true } } } },
            },
          },
          stage: {
            select: {
              name: true,
              order: true,
              defaultTeam: { select: { name: true } },
              // Ver o comentário equivalente na primeira consulta acima: `dependents` é o lado
              // certo da relação para os PRÉ-REQUISITOS da etapa.
              dependents: { select: { dependsOnStageId: true } },
            },
          },
          team: { select: { name: true } },
          assignee: { select: { name: true, email: true } },
        },
        orderBy: [{ stage: { order: "asc" } }, { id: "asc" }],
      })
    : [];

  // Os pares (demanda, etapa) que ESTA leitura de fato enxerga — as etapas que passaram pelos
  // filtros acima. O realizado se restringe a eles: quando há `?team=`, `linhas` já é o recorte do
  // time, e somar o `TimeLog` da demanda INTEIRA faria a coluna "feito" responder sobre a agência
  // toda enquanto o resto da tela responde sobre um time só. É o par de chaves que mantém
  // `ClientDay.doneHours` sendo a soma das etapas exibidas, e não do que ficou de fora.
  const paresEmTela = new Set([...linhas, ...restantes].map((l) => `${l.task.id}:${l.stageId}`));

  // O REALIZADO: horas apontadas na janela, por etapa e por dia. `logDate` é instante real (o
  // fechamento do cronômetro grava `endedAt`, e o formulário manual grava o instante real do dia
  // informado — ver `logTime` em lib/actions/task.ts), então a janela usa `realInstant` — a mesma
  // conta de `completedAt`. Comparar com a representação SP-local erraria em três horas e sumiria
  // com o que foi trabalhado à noite.
  //
  // A consulta filtra por demanda E por etapa; o cruzamento exato dos pares fica no laço abaixo,
  // porque `in` × `in` ainda deixaria passar (demanda A, etapa de B).
  const stageIdsEmTela = [...new Set([...linhas, ...restantes].map((l) => l.stageId))];
  const apontamentos = idsEmTela.length
    ? await prisma.timeLog.findMany({
        where: {
          taskId: { in: idsEmTela },
          stageId: { in: stageIdsEmTela },
          logDate: { gte: inicioReal, lte: fimReal },
        },
        select: { taskId: true, stageId: true, hoursSpent: true, logDate: true },
      })
    : [];

  // (taskId, stageId, dia) → horas trabalhadas. O dia é o do calendário de São Paulo, senão o
  // apontamento da noite cairia no dia seguinte.
  const realizadoPorEtapaDia = new Map<string, number>();
  // (taskId, stageId) → total trabalhado na janela, para descontar da referência.
  const realizadoPorEtapa = new Map<string, number>();
  const chave = (taskId: string, stageId: string, dia?: string) =>
    dia ? `${taskId}:${stageId}:${dia}` : `${taskId}:${stageId}`;

  // taskId → clientId: para creditar o apontamento ao cliente certo mesmo quando o dia em que se
  // trabalhou não é o dia em que a etapa está POSICIONADA na célula (etapa concluída/planejada num
  // dia, mas trabalhada em outro).
  const clienteDaTarefa = new Map<string, string>();
  for (const l of linhas) clienteDaTarefa.set(l.task.id, l.task.project.client.id);

  // (clientId, dia) → total apontado. É a fonte de `ClientDay.doneHours`: o realizado do dia é o
  // que foi de fato trabalhado NAQUELE dia, direto do apontamento — não a soma das etapas que a
  // célula desse dia por acaso está exibindo.
  const doneHorasPorClienteDia = new Map<string, number>();

  for (const a of apontamentos) {
    if (!a.stageId) continue; // hora lançada na demanda inteira, sem etapa: não é de ninguém aqui
    // Etapa que não passou pelos filtros desta leitura não tem linha para mostrar a hora dela — e
    // somá-la mesmo assim é o que fazia o `?team=` mentir sobre o que o time entregou.
    if (!paresEmTela.has(`${a.taskId}:${a.stageId}`)) continue;
    const dia = formatISODate(nowInSaoPaulo(a.logDate));
    const kDia = chave(a.taskId, a.stageId, dia);
    realizadoPorEtapaDia.set(kDia, (realizadoPorEtapaDia.get(kDia) ?? 0) + a.hoursSpent);
    const kEtapa = chave(a.taskId, a.stageId);
    realizadoPorEtapa.set(kEtapa, (realizadoPorEtapa.get(kEtapa) ?? 0) + a.hoursSpent);

    const clientId = clienteDaTarefa.get(a.taskId);
    if (clientId && days.includes(dia)) {
      const kCliente = `${clientId}:${dia}`;
      doneHorasPorClienteDia.set(
        kCliente,
        (doneHorasPorClienteDia.get(kCliente) ?? 0) + a.hoursSpent
      );
    }
  }

  const referencias = await getStageReferences([
    ...new Set([...linhas, ...restantes].map((l) => l.stageId)),
  ]);
  const horasDe = (stageId: string) => referencias.get(stageId)?.hours ?? 0;
  const sourceDe = (stageId: string) => referencias.get(stageId)?.source ?? "declared";

  const hojeISO = formatISODate(todayInSaoPaulo());
  const hojeNaSemana = days.includes(hojeISO) ? hojeISO : null;

  // cliente → dia → demanda → bloco. Três níveis porque a célula tem três: o cliente é a linha, o
  // dia é a coluna, e dentro dela a demanda agrupa as etapas.
  type Acc = { name: string; dias: Map<string, Map<string, TaskBlock>> };
  const porCliente = new Map<string, Acc>();

  // As duas consultas têm o mesmo `select`, mas nascem de chamadas Prisma diferentes — o TypeScript
  // não unifica os dois tipos automaticamente. `LinhaProjetavel` é o tipo comum que `encaixar` e a
  // projeção usam.
  type LinhaProjetavel = (typeof linhas)[number] | (typeof restantes)[number];

  const encaixar = (
    row: LinhaProjetavel,
    dia: string,
    opcoes: { contaPendente?: boolean; apenasSeExistir?: boolean } = {}
  ) => {
    const { contaPendente = true, apenasSeExistir = false } = opcoes;
    const cliente = row.task.project.client;
    const accExistente = porCliente.get(cliente.id);
    const diaExistente = accExistente?.dias.get(dia);
    const blocoExistente = diaExistente?.get(row.task.id);
    // Quem não contribui nada só entra se a demanda já tiver bloco neste dia — a célula continua
    // fechando a demanda inteira, mas sem inventar um bloco vazio para quem não fechou, não apontou
    // e não carrega pendente aqui.
    if (apenasSeExistir && !blocoExistente) return;

    const acc = accExistente ?? { name: cliente.name, dias: new Map() };
    const doDia = diaExistente ?? new Map<string, TaskBlock>();
    const vencimento = row.task.dueDate ? formatISODate(row.task.dueDate) : null;
    const bloco = blocoExistente ?? {
      taskId: row.task.id,
      projectName: row.task.project.name,
      taskTitle: row.task.title,
      dueDateISO: vencimento,
      // Vencida = o prazo já passou E a demanda não fechou. É o que justifica o empilhamento em
      // hoje, e a tela precisa dizer isso em vez de mostrar um amontoado sem causa. A segunda
      // metade não é detalhe: sem ela, a demanda ENTREGUE com um dia de atraso ficava vermelha
      // para sempre, avisando de um empilhamento que não existe mais.
      overdue: !!vencimento && vencimento < hojeISO && row.task.status !== "COMPLETED",
      doneHours: 0,
      pendingHours: 0,
      stages: [],
    };

    const referencia = horasDe(row.stageId);
    const kEtapa = chave(row.task.id, row.stageId);
    // Feito NO DIA desta célula: o apontamento se divide sozinho pelos dias em que a pessoa
    // trabalhou. É isto que responde "1h num dia, 1h no outro, até fechar".
    const feitoNoDia = realizadoPorEtapaDia.get(chave(row.task.id, row.stageId, dia)) ?? 0;
    // Pendente é o que falta da referência, descontado tudo que já foi apontado na janela. Nunca
    // negativo: quem passou da referência não devolve horas ao cliente.
    const pendente = Math.max(0, referencia - (realizadoPorEtapa.get(kEtapa) ?? 0));

    // `state` diz o que já PODE começar — não o que soma. Ver o cabeçalho do arquivo: aqui o
    // pendente conta independente de a etapa estar liberada, porque toda etapa futura é, por
    // definição, ainda não liberada.
    const state: StageLine["state"] =
      row.status === "COMPLETED" ? "done" : row.status === "ACTIVE" ? "pending" : "waiting";
    bloco.doneHours += feitoNoDia;
    // O encaixe é RETROSPECTIVO quando a etapa está sendo posta num dia em que ela foi trabalhada,
    // e não no dia que a projeção lhe deu. Ali o número honesto é o medido.
    const retrospectivo = !contaPendente;
    // Desde a Task 3 a mesma etapa pode ser encaixada em mais de um dia: o dia PROJETADO (ou o dia
    // em que fechou) e, além dele, cada dia em que houve apontamento. Só o dia projetado carrega o
    // pendente — `contaPendente` é falso nos demais — senão a mesma hora pendente seria somada uma
    // vez por dia em que a etapa aparece, inflando o total da semana. Concluída também não carrega:
    // o que sobrou da referência dela não é trabalho que ainda vem.
    if (state !== "done" && contaPendente) bloco.pendingHours += pendente;

    // O número que a linha exibe: medição quando o encaixe olha para trás (etapa fechada, ou etapa
    // aberta aparecendo no dia em que foi trabalhada), referência só no dia projetado. Antes disto,
    // uma etapa aberta encaixada em três dias passados repetia o mesmo pendente nos três.
    const mostraReferencia = !(state === "done" || retrospectivo);

    bloco.stages.push({
      id: row.id,
      stageOrder: row.stage.order,
      stageName: row.stage.name,
      // Responsável, senão a EQUIPE efetiva (`teamId` da linha, senão o time padrão do modelo —
      // ver lib/stage-team.ts), senão nada: quem escreve "não atribuído" é a tela, no idioma de
      // quem lê. Sem esta queda, etapa sem dono aparecia sem nenhuma pista de quem a faria.
      assigneeName:
        row.assignee?.name ??
        row.assignee?.email ??
        row.team?.name ??
        row.stage.defaultTeam?.name ??
        null,
      hours: mostraReferencia ? pendente : feitoNoDia,
      doneHours: feitoNoDia,
      // A referência é estimativa quando não há amostra observada — a tela avisa, para o número não
      // passar por medição. Só que a marca fala sobre o número EXIBIDO: ao lado de um apontamento
      // ela diria "isto é estimativa" sobre uma hora que alguém de fato trabalhou.
      estimated: mostraReferencia && sourceDe(row.stageId) === "declared",
      state,
    });

    bloco.stages.sort(
      (x: StageLine, y: StageLine) => x.stageOrder - y.stageOrder || (x.id < y.id ? -1 : 1)
    );
    doDia.set(row.task.id, bloco);
    acc.dias.set(dia, doDia);
    porCliente.set(cliente.id, acc);
  };

  // Uma projeção por demanda: a cadeia é da demanda, e misturar demandas na mesma conta faria uma
  // empurrar a outra sem nenhuma relação entre elas.
  const linhasPorTarefa = new Map<string, LinhaProjetavel[]>();
  for (const row of [...linhas, ...restantes]) {
    const lista = linhasPorTarefa.get(row.task.id) ?? [];
    lista.push(row);
    linhasPorTarefa.set(row.task.id, lista);
  }

  const diaProjetado = new Map<string, string | null>();
  for (const [, rows] of linhasPorTarefa) {
    const projecao = projectDemandDays({
      stages: rows.map((r) => ({
        id: r.id,
        stageId: r.stageId,
        order: r.stage.order,
        dependsOnIds: r.stage.dependents.map((d) => d.dependsOnStageId),
        status: r.status,
        plannedDate: r.plannedDate ? formatISODate(r.plannedDate) : null,
        completedDay: r.completedAt ? formatISODate(nowInSaoPaulo(r.completedAt)) : null,
        pendingHours: Math.max(
          0,
          horasDe(r.stageId) - (realizadoPorEtapa.get(chave(r.task.id, r.stageId)) ?? 0)
        ),
      })),
      days,
      todayISO: hojeNaSemana,
      dueDateISO: rows[0].task.dueDate ? formatISODate(rows[0].task.dueDate) : null,
    });
    for (const [id, dia] of projecao) diaProjetado.set(id, dia);
  }

  // Três motivos, e só três, para a demanda aparecer num dia: a etapa FECHOU ali, houve
  // APONTAMENTO ali, ou a projeção põe PENDENTE ali (no dia projetado dela, maior que zero — zero é
  // o caso da etapa sem referência cadastrada, ou já coberta pelo apontamento: nenhum dos dois
  // justifica sozinho um bloco). Quem não contribui por nenhum destes três motivos não cria bloco —
  // ela só entra se a demanda já tiver um, na segunda passagem abaixo.
  const contribuiNoDia = (row: LinhaProjetavel, dia: string): boolean => {
    if (row.status === "COMPLETED") return true; // fechou — só é avaliada no dia em que fechou
    const feitoNoDia = realizadoPorEtapaDia.get(chave(row.task.id, row.stageId, dia)) ?? 0;
    if (feitoNoDia > 0) return true; // apontamento ali
    if (diaProjetado.get(row.id) !== dia) return false; // não é o dia em que a projeção a colocaria
    const referencia = horasDe(row.stageId);
    const pendente = Math.max(
      0,
      referencia - (realizadoPorEtapa.get(chave(row.task.id, row.stageId)) ?? 0)
    );
    return pendente > 0; // pendente ali
  };

  // Primeira passagem: cria bloco só quem contribui. Precisa ser uma passagem própria — decidir
  // "cria ou só entra" olhando pra uma única linha por vez deixaria o resultado à mercê da ORDEM em
  // que as linhas chegam (a de quem não contribui podendo processar antes da que abre o bloco).
  //
  // Para cada linha, guarda-se também o par (linha, dia principal) para a segunda passagem — os
  // dias extras por apontamento (`outroDia` abaixo) sempre contribuem por construção (o laço só os
  // visita quando há apontamento ali), então não precisam de segunda chance.
  const encaixesPrincipais: { row: LinhaProjetavel; dia: string }[] = [];

  for (const row of [...linhas, ...restantes]) {
    const concluida = row.status === "COMPLETED";
    // Concluída vale pelo dia em que fechou; o resto, pelo dia PROJETADO. `null` quer dizer que a
    // etapa não cabe nesta semana — e uma etapa que não cabe não aparece, em vez de empilhar no
    // sábado um trabalho que não é dele.
    const dia = concluida
      ? row.completedAt
        ? formatISODate(nowInSaoPaulo(row.completedAt))
        : null
      : (diaProjetado.get(row.id) ?? null);

    if (dia && days.includes(dia)) {
      encaixesPrincipais.push({ row, dia });
      if (contribuiNoDia(row, dia)) encaixar(row, dia);
    }

    // O apontamento do passado também põe a etapa nos dias em que ela foi trabalhada, mesmo que a
    // projeção a coloque adiante — e MESMO que o dia projetado tenha caído fora da semana (`dia`
    // null ou fora de `days`): senão as horas continuam somando em `ClientDay.doneHours` sem
    // nenhum bloco mostrá-las, o buraco que esta task existe para tapar. É o "trabalhei 2h ontem e
    // não terminei" da spec. `contaPendente` falso: o pendente desta etapa, se houver, já foi
    // contado no dia projetado acima (ou não cabe na semana, e então não há onde contá-lo).
    for (const outroDia of days) {
      if (outroDia === dia) continue;
      if ((realizadoPorEtapaDia.get(chave(row.task.id, row.stageId, outroDia)) ?? 0) > 0) {
        encaixar(row, outroDia, { contaPendente: false });
      }
    }
  }

  // Segunda passagem: quem não contribuiu sozinho no dia principal só entra se a demanda já tiver
  // bloco lá — fechando a demanda inteira na célula, sem inventar uma aparição vazia.
  for (const { row, dia } of encaixesPrincipais) {
    if (!contribuiNoDia(row, dia)) encaixar(row, dia, { apenasSeExistir: true });
  }

  const clients: ClientWeek[] = [...porCliente.entries()].map(([clientId, acc]) => {
    const byDay: Record<string, ClientDay> = {};
    let totalDone = 0;
    let totalPending = 0;
    for (const dia of days) {
      const blocos = [...(acc.dias.get(dia)?.values() ?? [])];
      // O feito do dia vem direto do apontamento daquele dia — não da soma dos blocos exibidos
      // nele. Uma etapa concluída num dia mas trabalhada em outro credita o dia em que a pessoa
      // de fato trabalhou, mesmo sem um bloco seu posicionado ali.
      const doneHours = doneHorasPorClienteDia.get(`${clientId}:${dia}`) ?? 0;
      const pendingHours = blocos.reduce((n, b) => n + b.pendingHours, 0);
      byDay[dia] = { doneHours, pendingHours, tasks: blocos };
      totalDone += doneHours;
      totalPending += pendingHours;
    }
    return {
      clientId,
      clientName: acc.name,
      totalDone,
      totalPending,
      byDay,
      stalled: [],
      stalledHours: 0,
    };
  });

  // O que ninguém pegou nem marcou. Consulta própria porque nenhuma das três portas da grade a
  // alcança: todas exigem vínculo com a semana (dia marcado, etapa reivindicada, conclusão nela).
  //
  // O `where` é um SUPERCONJUNTO LARGO DE PROPÓSITO — toda demanda com ALGUMA etapa aberta sem
  // dono e sem dia —, e a regra fina (ser a PRÓXIMA etapa) roda em memória, em `checkStalled`: "a
  // de menor ordem entre as não concluídas" não se escreve em SQL sem uma subconsulta por linha.
  // Duas tentações de estreitar isto aqui, e por que nenhuma das duas entra:
  //   - Um `take` cortaria silenciosamente o que ninguém tirou da tela — exatamente o defeito que
  //     esta coluna existe para expor. Melhor "carregou devagar" que "sumiu sem avisar".
  //   - Trocar `some: { status: { not: "COMPLETED" }, ... }` por `status: { in: ["ACTIVE",
  //     "BLOCKED"] }` deixaria de fora a demanda cuja próxima etapa aberta é INACTIVE (o caso
  //     normal: numa cadeia sequencial, toda etapa que ainda não é a atual É INACTIVE) — a coluna
  //     passaria a mentir por omissão, escondendo trabalho parado em vez de mostrá-lo.
  // As duas maiores fatias do superconjunto — a demanda já concluída e a que ainda nem deveria ter
  // começado — são cortadas abaixo, reaproveitando `availableTaskWhere` de lib/task-availability.ts
  // (a mesma regra "isto é trabalho de agora" que as telas de execução já usam) com um `status`
  // mais estrito por cima: `availableTaskWhere` só descarta CANCELLED/OBSOLETE, e esta tela
  // precisa descartar COMPLETED também — "Concluir demanda" (botão manual, `completeTask` em
  // lib/actions/task.ts) marca o status sem tocar nas etapas seguintes, e sem este corte a
  // demanda encerrada à mão ficaria parada para sempre.
  const candidatas = await prisma.task.findMany({
    where: {
      ...availableTaskWhere(),
      status: { notIn: ["CANCELLED", "OBSOLETE", "COMPLETED"] },
      activeStages: {
        some: { status: { not: "COMPLETED" }, assigneeId: null, plannedDate: null },
      },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      createdAt: true,
      // Defesa em profundidade para o `overdue` abaixo — mesmo espírito do guarda que já existe
      // no bloco da célula do dia (`row.task.status !== "COMPLETED"`, algumas centenas de linhas
      // acima): sem `status` aqui, uma demanda entregue com atraso e vencimento passado ficaria
      // marcada como vencida para sempre.
      status: true,
      project: { select: { name: true, client: { select: { id: true, name: true } } } },
      activeStages: {
        // Empate de `order` (duas etapas abertas com o mesmo número, nada no schema impede) sem
        // este desempate deixaria a ordem de linha do Postgres decidir quem é "a próxima" — e ela
        // pode trocar entre dois carregamentos da mesma tela.
        orderBy: [{ stage: { order: "asc" } }, { stageId: "asc" }],
        select: {
          stageId: true,
          status: true,
          assigneeId: true,
          plannedDate: true,
          teamId: true,
          stage: { select: { order: true, defaultTeamId: true } },
        },
      },
    },
  });

  const paradas = candidatas
    .map((t) => ({
      t,
      check: checkStalled(
        t.activeStages.map((a) => ({
          ...a,
          order: a.stage.order,
          defaultTeamId: a.stage.defaultTeamId,
        }))
      ),
    }))
    .filter(
      (
        x
      ): x is {
        t: (typeof candidatas)[number];
        check: { stalled: true; teamId: string | null; stageId: string };
      } => x.check.stalled
    )
    // Demanda SEM equipe efetiva aparece em qualquer filtro: ela não pertence a equipe nenhuma, e
    // com o filtro ligado sumiria de todas as visões. Dois gestores verem o mesmo item é melhor
    // que nenhum ver — a marca `sem equipe` explica por que ele está ali.
    .filter((x) => !teamId || x.check.teamId === null || x.check.teamId === teamId);

  const idsParados = paradas.map((x) => x.t.id);
  const [liberacoes, ultimoLog, refsParadas] = await Promise.all([
    idsParados.length
      ? prisma.stageTransition.findMany({
          where: { taskId: { in: idsParados }, status: "ACTIVE" },
          select: { taskId: true, stageId: true, at: true },
        })
      : Promise.resolve([]),
    idsParados.length
      ? prisma.timeLog.groupBy({
          by: ["taskId"],
          where: { taskId: { in: idsParados } },
          _max: { logDate: true },
        })
      : Promise.resolve([]),
    getStageReferences([
      ...new Set(
        paradas.flatMap((x) =>
          x.t.activeStages.filter((a) => a.status !== "COMPLETED").map((a) => a.stageId)
        )
      ),
    ]),
  ]);

  // A liberação MAIS RECENTE de cada etapa: uma etapa pode entrar em ACTIVE mais de uma vez
  // (bloqueio e desbloqueio, reversão), e o que interessa é desde quando ela está disponível AGORA.
  const liberacaoPorEtapa = new Map<string, string>();
  for (const l of liberacoes) {
    const k = `${l.taskId}:${l.stageId}`;
    const dia = formatISODate(nowInSaoPaulo(l.at));
    const anterior = liberacaoPorEtapa.get(k);
    if (!anterior || dia > anterior) liberacaoPorEtapa.set(k, dia);
  }
  const ultimoLogPorTarefa = new Map(
    ultimoLog
      .filter((g) => g._max.logDate)
      .map((g) => [g.taskId, formatISODate(nowInSaoPaulo(g._max.logDate as Date))])
  );

  const paradasPorCliente = new Map<string, { nome: string; itens: StalledItem[] }>();
  for (const { t, check } of paradas) {
    // A PRÓXIMA etapa já foi escolhida por `checkStalled` — usar `check.teamId`/`check.stageId`
    // em vez de recalcular a mesma derivação aqui. Duas contas para a mesma coisa convergem hoje
    // e podem divergir amanhã: o item passaria pelo filtro de uma equipe enquanto exibe "sem
    // equipe", e o "parado há N dias" contaria a partir da transição de outra etapa.
    const abertas = t.activeStages.filter((a) => a.status !== "COMPLETED");
    const vencimento = t.dueDate ? formatISODate(t.dueDate) : null;
    const item: StalledItem = {
      taskId: t.id,
      taskTitle: t.title,
      projectName: t.project.name,
      dueDateISO: vencimento,
      // `t.status !== "COMPLETED"` é defesa em profundidade: o `where` já exclui COMPLETED (ver
      // comentário da consulta acima), mas sem esta segunda checagem aqui a demanda entregue com
      // atraso ficaria vermelha para sempre caso a exclusão do `where` algum dia enfraqueça.
      overdue: !!vencimento && vencimento < hojeISO && t.status !== "COMPLETED",
      noTeam: check.teamId === null,
      idleDays: idleDays(
        stalledSince({
          releasedISO: liberacaoPorEtapa.get(`${t.id}:${check.stageId}`) ?? null,
          lastLogISO: ultimoLogPorTarefa.get(t.id) ?? null,
          createdISO: formatISODate(nowInSaoPaulo(t.createdAt)),
        }),
        hojeISO
      ),
      // A referência de TODAS as etapas por concluir: o que a demanda ainda custa inteira.
      hours: abertas.reduce((n, a) => n + (refsParadas.get(a.stageId)?.hours ?? 0), 0),
    };
    const acc = paradasPorCliente.get(t.project.client.id) ?? {
      nome: t.project.client.name,
      itens: [],
    };
    acc.itens.push(item);
    paradasPorCliente.set(t.project.client.id, acc);
  }

  // Um cliente pode ter APENAS trabalho parado — e é o pior caso, o cliente para quem ninguém está
  // trabalhando. Sem esta parte ele não teria linha na grade e sumiria da tela inteira.
  for (const c of clients) {
    const p = paradasPorCliente.get(c.clientId);
    c.stalled = sortStalled(p?.itens ?? []);
    c.stalledHours = c.stalled.reduce((n, i) => n + i.hours, 0);
    paradasPorCliente.delete(c.clientId);
  }
  for (const [clientId, p] of paradasPorCliente) {
    const stalled = sortStalled(p.itens);
    clients.push({
      clientId,
      clientName: p.nome,
      totalDone: 0,
      totalPending: 0,
      byDay: Object.fromEntries(days.map((d) => [d, { doneHours: 0, pendingHours: 0, tasks: [] }])),
      stalled,
      stalledHours: stalled.reduce((n, i) => n + i.hours, 0),
    });
  }

  // Do que mais pega a semana para o que menos: a pergunta que traz o gestor aqui é "quem está
  // comendo a capacidade", e ela se responde na primeira linha. Feito + por fazer, porque as duas
  // metades são ocupação da agência.
  clients.sort(
    (a, b) =>
      b.totalDone + b.totalPending - (a.totalDone + a.totalPending) ||
      // Entre clientes que ocupam o mesmo (dois zeros, por exemplo), quem tem mais parado primeiro.
      b.stalledHours - a.stalledHours ||
      a.clientName.localeCompare(b.clientName)
  );

  return { days, clients };
}
