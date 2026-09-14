import { cardNature } from "./classify";
import { mapCardToTask, type MapTaskContext, type MappedTask } from "./map-task";
import { matchMembers } from "./map-people";
import {
  futureStagesFor,
  mapListToStage,
  planStages,
  type MapStagesContext,
  type StageName,
  type StagePlan,
} from "./map-stages";
import { planRework, type ReworkEvent } from "./map-rework";
import type {
  CardMovement,
  ExportCard,
  LabelsById,
  TrelloAction,
  TrelloBoardExport,
  TrelloList,
  TrelloMember,
  WorkOSUser,
} from "./types";

export type { ExportCard, TrelloAction, TrelloBoardExport, TrelloList } from "./types";

/** Opções de nomeação do plano. Tudo opcional — os padrões batem com o quadro AtlanticoShop. */
export interface BuildImportPlanOptions {
  /** Prefixo do nome do projeto mensal: `"<clientName> <monthKey>"`. Padrão: `"AtlanticoShop"`. */
  clientName?: string;
  /** Nomes exatos (sensíveis a maiúsculas) das listas de CONCLUÍDO. Padrão: `["Concluido"]`.
   *
   * São várias porque, quando o mês vira, a lista `Concluido` é RENOMEADA para o mês (`Julio`) e
   * uma nova nasce — o card que ficou na renomeada foi entregue igual. Quem roda a importação
   * declara quais são, e é decisão dele: o quadro real tem `ABRIL ATL` e `concluido` como listas
   * arquivadas e vazias, então a convenção de nome não é estável o bastante para ser adivinhada, e
   * uma lista mal identificada viraria conclusão inventada. */
  completedListNames?: string[];
  /** ID do `Client` (WorkOS) dono dos projetos mensais — repassado verbatim para
   * `ImportPlan.projects[].clientId`, sem tocar o banco aqui (plan.ts continua puro). Usado pelo
   * escritor (Task 9, lib/trello/writer.ts) para criar/achar o `Project` de cada mês.
   *
   * Rodada de conserto 1: antes, o escritor DERIVAVA o cliente cortando o sufixo " <monthKey>" do
   * nome do projeto — amarrava a identidade de uma entidade a uma convenção de texto de outro
   * módulo (`clientName` abaixo, que só serve pra COMPOR O NOME, nunca para achar o registro).
   * Passar o id explícito aqui fecha essa amarra: quem monta o plano decide o cliente com um dado,
   * não com um recorte de string. Padrão `""` só para não quebrar quem constrói plano sem cliente
   * real (testes de plan.ts, que não escrevem no banco); o escritor recusa `clientId` vazio antes
   * de abrir qualquer transação — ver `resolveWriteContext` em writer.ts. */
  clientId?: string;
  /** Quem responde por um nome de lista de design que não é nome de pessoa,
   * `{ nome na lista: e-mail no WorkOS }` — `DISEÑO - SUPERVISIÓN` é o caso do quadro real. Sem
   * isso a lista fica sem dono, que é o certo: adivinhar quem supervisiona seria inventar. */
  designerAliases?: Record<string, string>;
  /** Casamentos declarados à mão, `{ apelido no Trello: e-mail no WorkOS }`, repassados a
   * `matchMembers` (map-people.ts) para a pessoa cujo cadastro foge do padrão que as três chaves
   * automáticas reconhecem. Quem roda a importação declara isso — plan.ts não adivinha. */
  manualMatches?: Record<string, string>;
  /** `{ nome da etapa: id do time }` — o time PADRÃO de cada etapa, lido do banco por quem roda a
   * importação (plan.ts continua puro e não consulta nada).
   *
   * Existe por causa de um defeito real: o dono declarado no card virava responsável por QUALQUER
   * etapa, e o resultado foi um designer constando como quem fez o controle de qualidade dos
   * flyers que ele mesmo desenhou. Com o time em mãos, a etapa cujo dono não pertence a ele fica
   * SEM dono — como `Desenho` já faz quando o quadro não diz quem desenhou.
   *
   * Etapa AUSENTE deste mapa não é validada, e isso é a escolha certa para as coringas
   * (`Aprovação`, `Relatório`, `Briefing`): elas podem ser executadas por vários times —
   * coordenação, social media, direção — e `TemplateStage.defaultTeamId` guarda UM só. Recusar ali
   * inventaria uma regra que o modelo não tem como expressar. */
  stageTeams?: Record<string, string>;
}

/**
 * Uma etapa planejada, com o responsável já resolvido para o usuário do WorkOS (quando o
 * `assigneeTrelloId` que planStages devolveu casou com alguém via matchMembers). Continua carregando
 * `assigneeTrelloId` — útil para o relatório do ensaio (Task 10) mostrar de onde veio a atribuição.
 */
export interface PlannedStage extends StagePlan {
  /** Usado pelo escritor (Task 9, lib/trello/writer.ts) para atribuir a etapa. `undefined` quando
   * não há responsável conhecido, ou quando o Trello ID não casou com nenhum usuário do WorkOS —
   * nunca adivinhado. */
  assigneeUserId?: string;
}

/** Uma demanda planejada: o card de origem mais os campos já mapeados, prontos para o escritor. */
export interface PlannedTask {
  /** O card de origem — a Task 9 usa `shortUrl` e `attachments` para montar os artefatos de link. */
  card: ExportCard;
  /** Mês do projeto ao qual esta demanda pertence (chave de `ImportPlan.projects`). */
  monthKey: string;
  title: string;
  description: string;
  dueDate: Date | null;
  priority: MappedTask["priority"];
  status: MappedTask["status"];
  completedAt: Date | null;
  /** Nunca vazio — cards sem etapa mapeável vão para `ImportPlan.skipped`, não viram PlannedTask. */
  stages: PlannedStage[];
  /** As etapas que a demanda tem PELA FRENTE, sem evidência nenhuma e por isso sem data e sem
   * histórico: só existem para que a demanda aberta continue o fluxo no produto. Vazio em demanda
   * concluída ou obsoleta. Ver `futureStagesFor` (map-stages.ts).
   *
   * `assigneeUserId` não é evidência de trabalho feito — é ROTEAMENTO: `Aprovação` e `Relatório`
   * ficam com quem abriu a demanda, que é quem responde por aprová-la e relatá-la. `Quality
   * Control` não: o portão é do time de qualidade, não do atendimento. */
  futureStages: PlannedFutureStage[];
  rework: ReworkEvent[];
}

/** Motivo do descarte de um card. Os três primeiros vêm da natureza (classify.ts); os dois últimos
 * são decisões do joiner: um card sem mês ou sem etapa mapeável nunca vira demanda planejada. */
/** Uma etapa que a demanda aberta tem pela frente. Sem segmentos, porque não houve permanência. */
export interface PlannedFutureStage {
  stageName: StageName;
  assigneeUserId?: string;
}

export type SkipReason =
  | "arquivado"
  | "separador"
  | "ausencia"
  | "referencia"
  | "sem mês"
  | "sem etapa mapeável";

export interface SkippedCard {
  card: ExportCard;
  reason: SkipReason;
}

export interface ImportPlan {
  projects: { monthKey: string; name: string; clientId: string }[];
  tasks: PlannedTask[];
  skipped: SkippedCard[];
  unmatchedPeople: TrelloMember[];
  /** `{ id do membro no Trello: id do usuário no WorkOS }`, para quem grava resolver AUTORIA.
   *
   *  O casamento já acontecia aqui (`matchMembers`) e morria aqui — o escritor não o recebia, e por
   *  isso todo artefato nascia com o autor de quem rodou a importação. Expor o mapa é o que permite
   *  o anexo pertencer a quem o subiu. Opcional para não quebrar plano montado à mão em teste. */
  peopleByTrelloId?: Record<string, string>;
}

/**
 * Junta os cinco módulos de mapeamento num plano de importação inspecionável, sem tocar no banco.
 *
 * Duas regras de descarte que não vêm da natureza do card, mas de evidência insuficiente:
 *
 * 1. **Sem mês** (`due` e `dateLastActivity` ausentes): não há projeto mensal para colocar a
 *    demanda, e inventar um mês forjaria o histórico. Vai para `skipped`.
 * 2. **Sem etapa mapeável**: `createTaskStages` (lib/stage-assignment-helpers.ts, chamada pela Task
 *    9) lança `"At least one stage must be included in the task."` quando recebe zero etapas. Uma
 *    demanda cuja lista não mapeia para etapa nenhuma (ex.: parada em `COMUNICADOR`) e sem
 *    movimentação nem anexo que sustente nível 1/2 produziria exatamente esse plano vazio — e
 *    derrubaria a transação do mês inteiro no meio da gravação. Descartar aqui, com motivo
 *    explícito, é mais barato do que descobrir isso no meio da escrita: no export real isso nunca
 *    acontece (as 230 demandas têm etapa), então o descarte é rede de segurança, não perda esperada.
 */
export function buildImportPlan(
  board: TrelloBoardExport,
  workosUsers: WorkOSUser[],
  opts: BuildImportPlanOptions = {}
): ImportPlan {
  const clientName = opts.clientName ?? "AtlanticoShop";
  const completedListNames = opts.completedListNames ?? ["Concluido"];

  const labelsById = buildLabelsById(board);
  const listNamesById = buildListNamesById(board);
  const completedListIds = board.lists
    .filter((l) => completedListNames.includes(l.name))
    .map((l) => l.id);
  const trelloIdByDesignerName = deriveTrelloIdByDesignerName(board.lists, board.members);
  const userIdByDesignerName = deriveUserIdByDesignerName(
    board.lists,
    workosUsers,
    opts.designerAliases ?? {}
  );

  const { byTrelloId, unmatched } = matchMembers(board.members, workosUsers, opts.manualMatches);

  const stagesCtx: MapStagesContext = { listNamesById, trelloIdByDesignerName };
  const taskCtx: MapTaskContext = { labelsById, completedListIds, completedListNames };
  const movementsByCardId = groupMovementsByCard(board.actions);

  // A trava de equipe da atribuição. Ambos vêm de FORA — plan.ts não consulta banco —, e ambos
  // vazios significam "sem trava", que é o comportamento anterior inteiro.
  const stageTeams = opts.stageTeams ?? {};
  const teamsByUser = new Map<string, Set<string>>(
    workosUsers.map((u) => [u.id, new Set(u.teamIds ?? [])])
  );

  const tasks: PlannedTask[] = [];
  const skipped: SkippedCard[] = [];
  const monthKeys = new Set<string>();

  for (const card of board.cards) {
    if (card.closed) {
      // Arquivar é DESCARTAR neste quadro: as listas mensais de concluído são renomeadas quando o
      // mês vira e somem quando envelhecem, e o que sobra dos meses antigos é o entulho. Vem antes
      // do descarte por natureza de propósito — um separador arquivado é UM card, e contá-lo em
      // dois motivos quebraria a conferência da soma contra o total (report.ts).
      skipped.push({ card, reason: "arquivado" });
      continue;
    }

    const nature = cardNature(card, labelsById);
    if (nature !== "demanda") {
      skipped.push({ card, reason: nature });
      continue;
    }

    const movements = movementsByCardId.get(card.id) ?? [];
    const mapped = mapCardToTask(card, movements, taskCtx);
    if (!mapped.monthKey) {
      // Checar o mês antes da etapa: um card sem os dois ganha um motivo só, e o mês é o mais
      // barato de verificar (não precisa resolver movimentações).
      skipped.push({ card, reason: "sem mês" });
      continue;
    }

    const { stages } = planStages(card, movements, stagesCtx);

    if (stages.length === 0) {
      skipped.push({ card, reason: "sem etapa mapeável" });
      continue;
    }

    const rework = planRework(movements, stagesCtx);
    const declaredOwner = declaredOwnerOf(card, byTrelloId);
    const creatorUserId = card.idMemberCreator ? byTrelloId.get(card.idMemberCreator) : undefined;
    const plannedStages: PlannedStage[] = stages.map((s) => ({
      ...s,
      // A evidência de execução manda: quem está no nome da lista ou anexou o arquivo fez o
      // trabalho. O membro declarado no card só entra onde ela não disse nada.
      assigneeUserId: assigneeFor(s, {
        byTrelloId,
        userIdByDesignerName,
        declaredOwner,
        creatorUserId,
        stageTeams,
        teamsByUser,
      }),
    }));

    monthKeys.add(mapped.monthKey);
    tasks.push({
      card,
      monthKey: mapped.monthKey,
      title: mapped.title,
      description: mapped.description,
      dueDate: mapped.dueDate,
      priority: mapped.priority,
      status: mapped.status,
      completedAt: mapped.completedAt,
      stages: plannedStages,
      futureStages: futureStagesFor(
        mapped.status,
        plannedStages.map((s) => s.stageName)
      ).map((stageName) => ({
        stageName,
        assigneeUserId: CREATOR_OWNED_STAGES.includes(stageName) ? creatorUserId : undefined,
      })),
      rework,
    });
  }

  const clientId = opts.clientId ?? "";
  const projects = [...monthKeys].sort().map((monthKey) => ({
    monthKey,
    name: `${clientName} ${monthKey}`,
    clientId,
  }));

  return {
    projects,
    tasks,
    skipped,
    unmatchedPeople: unmatched,
    peopleByTrelloId: Object.fromEntries(byTrelloId),
  };
}

/**
 * O responsável DECLARADO no card (`idMembers`), casado com um usuário do WorkOS.
 *
 * Um card do quadro real costuma declarar mais de uma pessoa — 80 dos 127 declaram de duas a
 * quatro, e os nomes mais frequentes são de quem supervisiona, não de quem executa. A escada:
 *
 *   1. um membro casado só → é ele, sem ambiguidade nenhuma;
 *   2. vários, e exatamente um deles também anexou arquivo no card → esse, porque anexar é
 *      evidência de execução e desempata sem chutar;
 *   3. vários e nenhum desempate → o PRIMEIRO da lista do card. Decisão explícita do dono do
 *      projeto (37 demandas do export caem aqui): a ordem em que o Trello guarda os membros não
 *      significa nada, então isto é uma escolha, não uma medição.
 *
 * Membro sem casamento no WorkOS não conta — ele já aparece em `ImportPlan.unmatchedPeople`.
 */
function declaredOwnerOf(card: ExportCard, byTrelloId: Map<string, string>): string | undefined {
  const declared = uniqueMatched(card.idMembers, byTrelloId);
  if (declared.length === 0) return undefined;
  if (declared.length === 1) return declared[0];

  const authors = uniqueMatched(
    (card.attachments ?? []).map((a) => a.idMember),
    byTrelloId
  );
  const alsoAttached = declared.filter((u) => authors.includes(u));
  if (alsoAttached.length === 1) return alsoAttached[0];

  return declared[0];
}

/** Os IDs de usuário WorkOS dos IDs de Trello dados, sem repetição e na ordem em que aparecem. */
function uniqueMatched(
  trelloIds: Array<string | undefined> | undefined,
  byTrelloId: Map<string, string>
): string[] {
  const out: string[] = [];
  for (const id of trelloIds ?? []) {
    const userId = id ? byTrelloId.get(id) : undefined;
    if (userId && !out.includes(userId)) out.push(userId);
  }
  return out;
}

function buildLabelsById(board: TrelloBoardExport): LabelsById {
  const labelsById: LabelsById = {};
  for (const label of board.labels) labelsById[label.id] = label.name;
  return labelsById;
}

function buildListNamesById(board: TrelloBoardExport): Record<string, string> {
  const listNamesById: Record<string, string> = {};
  for (const list of board.lists) listNamesById[list.id] = list.name;
  return listNamesById;
}

/**
 * Agrupa `board.actions` em `CardMovement[]` por ID de card. Só ações `updateCard` com
 * `listBefore`/`listAfter` (troca de lista) viram movimentação — comentário, anexo e outros tipos de
 * ação não têm essa forma e são ignorados.
 */
function groupMovementsByCard(actions: TrelloAction[]): Map<string, CardMovement[]> {
  const byCardId = new Map<string, CardMovement[]>();

  for (const action of actions) {
    if (action.type !== "updateCard") continue;
    const { card, listBefore, listAfter } = action.data;
    if (!card || !listBefore || !listAfter) continue;

    const movement: CardMovement = {
      fromListName: listBefore.name,
      toListName: listAfter.name,
      at: action.date,
    };

    const existing = byCardId.get(card.id);
    if (existing) {
      existing.push(movement);
    } else {
      byCardId.set(card.id, [movement]);
    }
  }

  return byCardId;
}

/**
 * Resolve o responsável de cada lista "DISEÑO - <pessoa>" para um ID de membro do Trello, casando o
 * nome extraído da lista com o `fullName` dos membros do quadro — o mesmo tipo de casamento por
 * palavra que matchMembers usa para pessoas, aqui aplicado a nomes de lista. Nunca adivinha: um nome
 * sem casamento único (zero ou mais de um membro) fica de fora do mapa, e planStages (map-stages.ts)
 * já trata a ausência de entrada como "sem responsável conhecido", nunca inferido.
 */
/**
 * O dono de uma etapa percorrida, da evidência mais forte para a mais fraca.
 *
 * **`Aprovação` é de quem ABRIU a demanda**, tenha o card passado pelo portão ou não —
 * `CREATOR_OWNED_STAGES` vale para a etapa percorrida e para a pendente, pela mesma razão: aprovar
 * é do atendimento. Sem isto a aprovação percorrida caía no membro declarado no card, e o Martin,
 * que é designer, aparecia aprovando 8 demandas. Quando o criador não casa com usuário do WorkOS,
 * fica sem dono em vez de cair em alguém.
 *
 * **`Desenho` é a outra exceção, e é a regra mais estrita do módulo: quem desenhou está no NOME da
 * lista, e só ali.** Sem nome na lista, a etapa fica sem dono. As outras duas evidências não
 * servem para esta etapa: o autor do anexo é quem SUBIU o arquivo — no quadro real, com frequência
 * o atendimento, e era assim que Pedro e Sara apareciam como responsáveis por 16 desenhos — e o
 * membro declarado no card é quem acompanha. Nenhum dos dois é evidência de ter desenhado. Custo
 * medido: 44 das 96 etapas de Desenho ficam sem dono; as outras 52 vêm do nome da lista.
 *
 * Para as demais etapas a escada continua: o membro do Trello que a lista ou o anexo apontou; o
 * nome da lista casado direto no WorkOS (é como FABRICIO, DIEGO e JORGE são alcançados — desenham
 * para este quadro sem serem membros dele); e, por último, quem o card declara em `idMembers`.
 */
function assigneeFor(
  stage: StagePlan,
  ctx: {
    byTrelloId: Map<string, string>;
    userIdByDesignerName: Record<string, string>;
    declaredOwner: string | undefined;
    creatorUserId: string | undefined;
    /** `{ nome da etapa: id do time }` — ver `stageTeams` em BuildImportPlanOptions. */
    stageTeams: Record<string, string>;
    /** `{ id do usuário: equipes dele }`. */
    teamsByUser: Map<string, Set<string>>;
  }
): string | undefined {
  const doNome = stage.designerName ? ctx.userIdByDesignerName[stage.designerName] : undefined;
  const doTrello = stage.assigneeTrelloId ? ctx.byTrelloId.get(stage.assigneeTrelloId) : undefined;

  const escolhido = (() => {
    if (stage.stageName === "Desenho") {
      return stage.designerName ? (doTrello ?? doNome) : undefined;
    }
    if (CREATOR_OWNED_STAGES.includes(stage.stageName)) {
      return ctx.creatorUserId;
    }
    return doTrello ?? doNome ?? ctx.declaredOwner;
  })();

  // A trava de EQUIPE, aplicada depois da escolha e nunca no lugar dela.
  //
  // O quadro do Trello diz quem estava no card; ele NÃO diz quem executou cada etapa. Onde a
  // evidência é forte (o nome na lista de design, o autor do anexo), a escolha acima já é boa. Onde
  // ela é fraca — o membro declarado —, a pessoa escolhida pode não ter nada a ver com a etapa, e
  // foi assim que um designer virou dono do controle de qualidade da peça que ele mesmo desenhou.
  //
  // Etapa sem time declarado passa direto: é o caso das coringas, que pertencem a vários times.
  const timeDaEtapa = ctx.stageTeams[stage.stageName];
  if (!escolhido || !timeDaEtapa) return escolhido;
  return ctx.teamsByUser.get(escolhido)?.has(timeDaEtapa) ? escolhido : undefined;
}

/** As etapas pendentes que ficam com quem ABRIU a demanda. `Quality Control` de propósito fora: o
 * portão de qualidade é do time de qualidade, não de quem pediu a peça. */
const CREATOR_OWNED_STAGES: StageName[] = ["Aprovação", "Relatório"];

/**
 * `{ NOME NA LISTA: id do usuário WorkOS }` para os nomes que as listas de design carregam.
 *
 * Existe porque o caminho lista → membro do Trello → usuário se rompe no meio: FABRICIO, DIEGO e
 * JORGE desenham para este quadro sem serem membros dele, e sem esta ponte a etapa deles nascia
 * sem dono. O casamento é por palavra inteira no nome do usuário e só vale quando é ÚNICO — dois
 * usuários com a mesma palavra no nome não escolhem nenhum, pela mesma razão de sempre.
 *
 * `aliases` cobre o nome que não é de pessoa (`SUPERVISIÓN`): quem roda a importação declara quem
 * responde por ele, e sem declaração fica sem dono.
 */
function deriveUserIdByDesignerName(
  lists: TrelloList[],
  users: WorkOSUser[],
  aliases: Record<string, string>
): Record<string, string> {
  const userIdByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));
  const result: Record<string, string> = {};

  for (const list of lists) {
    const designerName = mapListToStage(list.name)?.designerName?.toUpperCase();
    if (!designerName || result[designerName]) continue;

    const alias = aliases[designerName];
    if (alias) {
      const userId = userIdByEmail.get(alias.toLowerCase());
      if (userId) result[designerName] = userId;
      continue;
    }

    const matches = users.filter((u) => fullNameHasWord(u.name, designerName));
    if (matches.length === 1) result[designerName] = matches[0].id;
  }

  return result;
}

function deriveTrelloIdByDesignerName(
  lists: TrelloList[],
  members: TrelloMember[]
): Record<string, string> {
  const designerNames = new Set<string>();
  for (const list of lists) {
    const mapped = mapListToStage(list.name);
    if (mapped?.designerName) designerNames.add(mapped.designerName.toUpperCase());
  }

  const result: Record<string, string> = {};
  for (const designerName of designerNames) {
    const matches = members.filter((m) => fullNameHasWord(m.fullName, designerName));
    if (matches.length === 1) {
      result[designerName] = matches[0].id;
    }
  }
  return result;
}

function normalizeWord(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function fullNameHasWord(fullName: string, word: string): boolean {
  const target = normalizeWord(word);
  return fullName
    .split(/\s+/)
    .filter((p) => p.length > 0)
    .some((part) => normalizeWord(part) === target);
}
