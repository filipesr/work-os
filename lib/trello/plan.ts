import { cardNature } from "./classify";
import { mapCardToTask, type MapTaskContext, type MappedTask } from "./map-task";
import { matchMembers } from "./map-people";
import { mapListToStage, planStages, type MapStagesContext, type StagePlan } from "./map-stages";
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
  /** Nome exato (sensível a maiúsculas) da lista "concluído", usada para achar seu ID e assim
   * decidir `Task.status`. Padrão: `"Concluido"`. O export real tem DUAS listas com esse nome em
   * caixas diferentes ("Concluido" e "concluido") — casar por nome exato replica a mesma escolha já
   * fixada em map-task.test.ts (`CONCLUIDO_LIST_ID`), sem inventar um critério novo aqui. */
  concludoListName?: string;
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
  rework: ReworkEvent[];
}

/** Motivo do descarte de um card. Os três primeiros vêm da natureza (classify.ts); os dois últimos
 * são decisões do joiner: um card sem mês ou sem etapa mapeável nunca vira demanda planejada. */
export type SkipReason = "separador" | "ausencia" | "referencia" | "sem mês" | "sem etapa mapeável";

export interface SkippedCard {
  card: ExportCard;
  reason: SkipReason;
}

export interface ImportPlan {
  projects: { monthKey: string; name: string; clientId: string }[];
  tasks: PlannedTask[];
  skipped: SkippedCard[];
  unmatchedPeople: TrelloMember[];
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
  const concludoListName = opts.concludoListName ?? "Concluido";

  const labelsById = buildLabelsById(board);
  const listNamesById = buildListNamesById(board);
  const concludoListId = board.lists.find((l) => l.name === concludoListName)?.id ?? "";
  const trelloIdByDesignerName = deriveTrelloIdByDesignerName(board.lists, board.members);

  const { byTrelloId, unmatched } = matchMembers(board.members, workosUsers);

  const stagesCtx: MapStagesContext = { listNamesById, trelloIdByDesignerName };
  const taskCtx: MapTaskContext = { labelsById, concludoListId, concludoListName };
  const movementsByCardId = groupMovementsByCard(board.actions);

  const tasks: PlannedTask[] = [];
  const skipped: SkippedCard[] = [];
  const monthKeys = new Set<string>();

  for (const card of board.cards) {
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
    const plannedStages: PlannedStage[] = stages.map((s) => ({
      ...s,
      assigneeUserId: s.assigneeTrelloId ? byTrelloId.get(s.assigneeTrelloId) : undefined,
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
      rework,
    });
  }

  const clientId = opts.clientId ?? "";
  const projects = [...monthKeys].sort().map((monthKey) => ({
    monthKey,
    name: `${clientName} ${monthKey}`,
    clientId,
  }));

  return { projects, tasks, skipped, unmatchedPeople: unmatched };
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
