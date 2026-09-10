import type { Card, CardMovement, LabelsById } from "./types";

/** Contexto necessário para mapear um card para task. */
export interface MapTaskContext {
  /** Mapa de ID de rótulo para seu nome. */
  labelsById: LabelsById;
  /** ID da lista "Concluido" no quadro — casa com `card.idList` para decidir o status. */
  concludoListId: string;
  /** NOME da lista "Concluido" no quadro. Necessário além do id porque `CardMovement` carrega o
   * NOME da lista (`toListName`), não o id — é por ele que se acha a movimentação de conclusão,
   * a evidência datada de que o card foi concluído. */
  concludoListName: string;
}

/** Resultado do mapeamento: campos da demanda. */
export interface MappedTask {
  /** Título da demanda, com prefixo de tipo se aplicável. */
  title: string;
  /** Descrição do card. */
  description: string;
  /** Data de vencimento, se houver. */
  dueDate: Date | null;
  /** Prioridade, derivada de rótulos. */
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  /** Status da demanda. */
  status: "IN_PROGRESS" | "COMPLETED" | "OBSOLETE" | "BACKLOG" | "PAUSED" | "CANCELLED";
  /** Data de conclusão (apenas para COMPLETED). */
  completedAt: Date | null;
  /** Mês do projeto (YYYY-MM), usado para agrupamento. */
  monthKey: string | null;
}

/** Rótulos de tipo que viram prefixo do título. */
const TYPE_LABELS = new Set(["STORIES", "SOCIAL MEDIA", "REELS"]);

/**
 * Mapeia um card do Trello para os campos da demanda.
 *
 * Regras principais:
 * - Status COMPLETED: card na lista Concluido (completedAt só para COMPLETED, e só com evidência)
 * - Status OBSOLETE: card arquivado em outra lista (sem completedAt)
 * - Status IN_PROGRESS: card aberto fora de Concluido
 * - Prioridade: URGENTE→URGENT, PRIORIDAD/IMPORTANTE→HIGH, padrão→MEDIUM
 * - Mês: from due, else dateLastActivity, else null
 */
export function mapCardToTask(
  card: Card,
  movements: CardMovement[],
  ctx: MapTaskContext
): MappedTask {
  const typeLabel = extractTypeLabel(card, ctx.labelsById);
  const title = typeLabel ? `[${typeLabel}] ${card.name}` : card.name;
  const description = card.desc || "";
  const dueDate = card.due ? new Date(card.due) : null;
  const priority = extractPriority(card, ctx.labelsById);
  const { status, completedAt } = extractStatusAndCompletedAt(card, movements, ctx);
  const monthKey = extractMonthKey(card);

  return {
    title,
    description,
    dueDate,
    priority,
    status,
    completedAt,
    monthKey,
  };
}

/**
 * Extrai o rótulo de tipo (STORIES, SOCIAL MEDIA, REELS) do primeiro que aparecer.
 * Ordem estável: mantém ordem do card.idLabels.
 */
function extractTypeLabel(card: Card, labelsById: LabelsById): string | null {
  if (!card.idLabels || card.idLabels.length === 0) {
    return null;
  }

  for (const labelId of card.idLabels) {
    const labelName = labelsById[labelId];
    if (labelName && TYPE_LABELS.has(labelName)) {
      return labelName;
    }
  }

  return null;
}

/**
 * Extrai a prioridade a partir dos rótulos.
 *
 * Precedência: URGENTE > (PRIORIDAD|IMPORTANTE) > MEDIUM
 */
function extractPriority(card: Card, labelsById: LabelsById): "LOW" | "MEDIUM" | "HIGH" | "URGENT" {
  if (!card.idLabels || card.idLabels.length === 0) {
    return "MEDIUM";
  }

  // Procura por rótulos de prioridade, com precedência
  let hasUrgent = false;
  let hasHigh = false;

  for (const labelId of card.idLabels) {
    const labelName = labelsById[labelId];
    if (!labelName) continue;

    if (labelName === "URGENTE") {
      hasUrgent = true;
    } else if (labelName === "PRIORIDAD" || labelName === "IMPORTANTE") {
      hasHigh = true;
    }
  }

  if (hasUrgent) return "URGENT";
  if (hasHigh) return "HIGH";
  return "MEDIUM";
}

/**
 * Extrai status e completedAt.
 *
 * Regras:
 * - Card na lista Concluido → COMPLETED + completedAt (quando há evidência datada; ver abaixo)
 * - Card arquivado em outra lista → OBSOLETE + null (o card foi abandonado, não entregue)
 * - Card aberto → IN_PROGRESS + null
 *
 * `completedAt` de uma demanda COMPLETED sai, nesta ordem de precedência:
 *   1. a data da ÚLTIMA movimentação do card para a lista `Concluido` — o EVENTO da entrega,
 *      datado pela ação do Trello (`updateCard`), cobre 41 dos 52 cards do export real;
 *   2. `card.dateCompleted` — a marcação de conclusão do próprio Trello, cobre 38;
 *   3. `null` — 3 cards não têm nenhuma das duas, e uma data plausível não se inventa.
 *
 * `card.dateClosed` NÃO entra: é o carimbo do arquivamento, nulo nos 52 (ver types.ts).
 */
function extractStatusAndCompletedAt(
  card: Card,
  movements: CardMovement[],
  ctx: MapTaskContext
): { status: "IN_PROGRESS" | "COMPLETED" | "OBSOLETE"; completedAt: Date | null } {
  const isInConcluido = card.idList === ctx.concludoListId;

  if (isInConcluido) {
    // Card na lista Concluido é sempre COMPLETED
    const movedAt = lastMoveToList(movements, ctx.concludoListName);
    const completedAt = movedAt ?? (card.dateCompleted ? new Date(card.dateCompleted) : null);
    return { status: "COMPLETED", completedAt };
  }

  if (card.closed) {
    // Card arquivado em outra lista é OBSOLETE, sem completedAt
    return { status: "OBSOLETE", completedAt: null };
  }

  // Card aberto fora de Concluido é IN_PROGRESS
  return { status: "IN_PROGRESS", completedAt: null };
}

/**
 * A data da ÚLTIMA movimentação do card PARA a lista dada, ou `null` se não houver nenhuma.
 *
 * A última, não a primeira: um card devolvido de `Concluido` e reconcluído depois foi entregue na
 * segunda vez — datar pela primeira contaria como entregue um trabalho que voltou. `CardMovement`
 * carrega o NOME da lista (não o id), e o casamento é exato, sensível a maiúsculas, como no resto
 * do módulo — o quadro real tem "Concluido" e "concluido" como listas diferentes.
 */
function lastMoveToList(movements: CardMovement[], listName: string): Date | null {
  let latest: Date | null = null;
  for (const m of movements) {
    if (m.toListName !== listName) continue;
    const at = new Date(m.at);
    if (!latest || at > latest) latest = at;
  }
  return latest;
}

/**
 * Extrai o mês do projeto (YYYY-MM).
 *
 * Ordem de precedência:
 * 1. due (data de vencimento)
 * 2. dateLastActivity (última atividade)
 * 3. null (sem mês definido, vai para repescagem)
 */
function extractMonthKey(card: Card): string | null {
  const dateStr = card.due || card.dateLastActivity;

  if (!dateStr) {
    return null;
  }

  // Extrai YYYY-MM da data ISO 8601
  const match = dateStr.match(/^(\d{4})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }

  return null;
}
