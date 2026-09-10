import type { Card, LabelsById } from "./types";

/** Contexto necessário para mapear um card para task. */
export interface MapTaskContext {
  /** Mapa de ID de rótulo para seu nome. */
  labelsById: LabelsById;
  /** ID da lista "Concluido" no quadro. */
  concludoListId: string;
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
 * - Status COMPLETED: card na lista Concluido (dateClosed apenas para COMPLETED)
 * - Status OBSOLETE: card arquivado em outra lista (sem completedAt)
 * - Status IN_PROGRESS: card aberto fora de Concluido
 * - Prioridade: URGENTE→URGENT, PRIORIDAD/IMPORTANTE→HIGH, padrão→MEDIUM
 * - Mês: from due, else dateLastActivity, else null
 */
export function mapCardToTask(card: Card, ctx: MapTaskContext): MappedTask {
  const typeLabel = extractTypeLabel(card, ctx.labelsById);
  const title = typeLabel ? `[${typeLabel}] ${card.name}` : card.name;
  const description = card.desc || "";
  const dueDate = card.due ? new Date(card.due) : null;
  const priority = extractPriority(card, ctx.labelsById);
  const { status, completedAt } = extractStatusAndCompletedAt(card, ctx.concludoListId);
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
 * - Card na lista Concluido → COMPLETED + completedAt
 * - Card arquivado em outra lista → OBSOLETE + null
 * - Card aberto → IN_PROGRESS + null
 */
function extractStatusAndCompletedAt(
  card: Card,
  concludoListId: string
): { status: "IN_PROGRESS" | "COMPLETED" | "OBSOLETE"; completedAt: Date | null } {
  const isInConcluido = card.idList === concludoListId;

  if (isInConcluido) {
    // Card na lista Concluido é sempre COMPLETED
    const completedAt = card.dateClosed ? new Date(card.dateClosed) : null;
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
