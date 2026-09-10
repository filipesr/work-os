import type { Card, CardMovement } from "./types";

/** Nomes de etapa possíveis — precisam bater EXATAMENTE com o template "Demanda GoOn" do banco. */
export type StageName = "Desenho" | "Audio Visual" | "Quality Control" | "Aprovação";

/** Uma etapa planejada para a demanda, com o nível de detalhe que a evidência sustenta. */
export interface StagePlan {
  stageName: StageName;
  assigneeTrelloId?: string;
  enteredAt?: Date;
  exitedAt?: Date;
  /** true quando há evidência de que a etapa foi encerrada (saída conhecida). */
  completed: boolean;
}

/** Contexto necessário para planejar as etapas de um card. */
export interface MapStagesContext {
  /** Nome da lista do Trello por ID — resolve `card.idList` para o nome usado no mapeamento. */
  listNamesById: Record<string, string>;
  /**
   * ID do membro do Trello por pessoa extraída da lista "DISEÑO - <pessoa>" (chave em MAIÚSCULAS,
   * ex.: "MARTIN"). Opcional: sem entrada correspondente, a etapa Desenho fica sem responsável —
   * nunca adivinhada.
   */
  trelloIdByDesignerName?: Record<string, string>;
}

/** Resultado do planejamento: as etapas incluídas e o nível de evidência usado. */
export interface PlanStagesResult {
  stages: StagePlan[];
  tier: 1 | 2 | 3;
}

type ProductionStageName = Extract<StageName, "Desenho" | "Audio Visual">;

/** Uma lista mapeada para etapa, com o nome do designer quando a lista for "DISEÑO - <pessoa>". */
interface MappedList {
  stageName: StageName;
  designerName?: string;
}

const DESENHO_LIST_PATTERN = /^DISE[ÑN]O\s*-\s*(.+)$/i;

/**
 * Planeja as etapas de uma demanda importada do Trello, seguindo a regra mestra: etapa sem
 * evidência é etapa NÃO-INCLUÍDA, nunca inferida.
 *
 * Três níveis de evidência, do mais forte ao mais fraco:
 * 1. Movimentação entre listas registrada — reconstrói a jornada inteira, com datas por etapa.
 * 2. Sem movimentação, mas com anexo (autor + data) — marca a etapa de produção (Desenho ou
 *    Audio Visual) como percorrida, com responsável e data. Nada é afirmado sobre revisão/aprovação.
 * 3. Só a lista onde o card parou — a etapa de produção entra pela lista de origem, sem data.
 *
 * Estar em "Concluido" NUNCA basta para incluir Quality Control ou Aprovação: essas etapas só
 * entram quando uma movimentação de/para REVISIÓN ou LIBERADO for observada (nível 1).
 */
export function planStages(
  card: Card,
  movements: CardMovement[],
  ctx: MapStagesContext
): PlanStagesResult {
  if (movements.length > 0) {
    return { stages: planFromMovements(movements, ctx), tier: 1 };
  }

  const attachment = bestAttachmentEvidence(card.attachments);
  if (attachment) {
    return { stages: planFromAttachment(card, ctx, attachment), tier: 2 };
  }

  return { stages: planFromOriginList(card, ctx), tier: 3 };
}

/** Mapeia o nome de uma lista do Trello para a etapa correspondente, se houver. */
function mapListToStage(listName: string): MappedList | null {
  const trimmed = listName.trim();

  if (trimmed === "AUDIOVISUAL") return { stageName: "Audio Visual" };
  if (trimmed === "REVISIÓN") return { stageName: "Quality Control" };
  if (trimmed === "LIBERADO") return { stageName: "Aprovação" };

  const desenhoMatch = DESENHO_LIST_PATTERN.exec(trimmed);
  if (desenhoMatch) {
    return { stageName: "Desenho", designerName: desenhoMatch[1].trim() };
  }

  return null;
}

/** Resolve o responsável de "Desenho" a partir do nome extraído da lista, via ctx. Nunca adivinha. */
function resolveDesignerAssignee(
  designerName: string | undefined,
  ctx: MapStagesContext
): string | undefined {
  if (!designerName) return undefined;
  return ctx.trelloIdByDesignerName?.[designerName.toUpperCase()];
}

/** Resolve a etapa de PRODUÇÃO (Desenho ou Audio Visual) a partir da lista onde o card está agora. */
function resolveOriginProductionStage(
  card: Card,
  ctx: MapStagesContext
): { stageName: ProductionStageName; assigneeTrelloId?: string } | null {
  if (!card.idList) return null;

  const listName = ctx.listNamesById[card.idList];
  if (!listName) return null;

  const mapped = mapListToStage(listName);
  if (!mapped) return null;
  if (mapped.stageName !== "Desenho" && mapped.stageName !== "Audio Visual") return null;

  return {
    stageName: mapped.stageName,
    assigneeTrelloId: resolveDesignerAssignee(mapped.designerName, ctx),
  };
}

/**
 * Nível 3: só a lista de origem. Nenhuma data é afirmada — não há evidência de quando a etapa
 * começou ou terminou, só de que o card passou por ela.
 */
function planFromOriginList(card: Card, ctx: MapStagesContext): StagePlan[] {
  const origin = resolveOriginProductionStage(card, ctx);
  if (!origin) return [];

  return [
    {
      stageName: origin.stageName,
      assigneeTrelloId: origin.assigneeTrelloId,
      completed: false,
    },
  ];
}

/**
 * Nível 2: sem movimentação, mas com anexo. O anexo diz quem produziu (autor) e quando (data) —
 * nada sobre revisão ou aprovação, então a etapa continua sendo só a de produção, resolvida pela
 * mesma lista de origem do nível 3.
 */
function planFromAttachment(
  card: Card,
  ctx: MapStagesContext,
  attachment: { idMember?: string; date?: string | null }
): StagePlan[] {
  const origin = resolveOriginProductionStage(card, ctx);
  if (!origin) return [];

  return [
    {
      stageName: origin.stageName,
      assigneeTrelloId: attachment.idMember ?? origin.assigneeTrelloId,
      enteredAt: attachment.date ? new Date(attachment.date) : undefined,
      completed: false,
    },
  ];
}

/** Melhor evidência de anexo: o mais antigo com data conhecida — "quando" é exigido para o nível 2. */
function bestAttachmentEvidence(
  attachments: Card["attachments"]
): { idMember?: string; date?: string | null } | undefined {
  if (!attachments || attachments.length === 0) return undefined;

  const comDatas = attachments.filter((a) => a.date);
  if (comDatas.length === 0) return undefined;

  return [...comDatas].sort(
    (a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime()
  )[0];
}

/** Uma visita a uma lista, com quando entrou e quando saiu (undefined = desconhecido). */
interface ListVisit {
  listName: string;
  enteredAt?: string;
  exitedAt?: string;
}

/**
 * Nível 1: reconstrói a sequência de listas visitadas a partir das movimentações, e agrega por
 * etapa (uma entrada por nome de etapa, na ordem da primeira visita). Listas que não mapeiam para
 * etapa nenhuma (ex.: "COMUNICADOR", "Concluido") são ignoradas — não produzem StagePlan.
 */
function planFromMovements(movements: CardMovement[], ctx: MapStagesContext): StagePlan[] {
  const sorted = [...movements].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const visits: ListVisit[] = [];
  sorted.forEach((m, i) => {
    if (i === 0) {
      visits.push({ listName: m.fromListName, enteredAt: undefined, exitedAt: m.at });
    } else {
      visits[visits.length - 1].exitedAt = m.at;
    }
    // exitedAt fica undefined até a próxima iteração fechar esta visita (ou permanece undefined
    // se esta for a lista atual do card — ainda não há evidência de saída).
    visits.push({ listName: m.toListName, enteredAt: m.at, exitedAt: undefined });
  });

  const order: StageName[] = [];
  const byStage = new Map<StageName, StagePlan>();

  for (const visit of visits) {
    const mapped = mapListToStage(visit.listName);
    if (!mapped) continue;

    const existing = byStage.get(mapped.stageName);
    const exitedAt = visit.exitedAt ? new Date(visit.exitedAt) : undefined;

    if (!existing) {
      order.push(mapped.stageName);
      byStage.set(mapped.stageName, {
        stageName: mapped.stageName,
        assigneeTrelloId: resolveDesignerAssignee(mapped.designerName, ctx),
        enteredAt: visit.enteredAt ? new Date(visit.enteredAt) : undefined,
        exitedAt,
        completed: exitedAt !== undefined,
      });
    } else {
      existing.exitedAt = exitedAt;
      existing.completed = exitedAt !== undefined;
      if (!existing.assigneeTrelloId) {
        existing.assigneeTrelloId = resolveDesignerAssignee(mapped.designerName, ctx);
      }
    }
  }

  return order.map((name) => byStage.get(name) as StagePlan);
}
