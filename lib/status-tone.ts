// Sistema de "tone" semântico sobre os tokens do design system (nexo). Substitui
// os mapas de cor Tailwind hardcoded que estavam triplicados (TaskDetailView,
// TaskCard, tabelas admin). Cada tone mapeia para classes theme-aware.
// Ver docs/arquitetura-de-informacao.md §3 (unificar StatusBadge).

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** Classes de badge (bg sutil + texto) por tone — funcionam em claro e escuro. */
export const toneBadgeClass: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
};

/** Classes do "chip" de ícone (fundo sutil + ícone) por tone — usado nos KPIs. */
export const toneIconClass: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
};

/** Cor de texto pura por tone (para números/valores). */
export const toneTextClass: Record<Tone, string> = {
  neutral: "text-foreground",
  info: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

/** Prioridade da tarefa → tone. */
export function priorityTone(priority: string): Tone {
  switch (priority) {
    case "URGENT":
      return "danger";
    case "HIGH":
      return "warning";
    case "MEDIUM":
      return "info";
    default:
      return "neutral";
  }
}

/** Status da etapa ativa → tone. `overdue` (atrasada) sobrepõe para danger. */
export function stageStatusTone(status: string, overdue = false): Tone {
  if (overdue) return "danger";
  switch (status) {
    case "ACTIVE":
      return "info";
    case "BLOCKED":
      return "warning";
    case "COMPLETED":
      return "success";
    default:
      return "neutral";
  }
}

/** Status da tarefa → tone. */
export function taskStatusTone(status: string): Tone {
  switch (status) {
    case "IN_PROGRESS":
      return "info";
    case "COMPLETED":
      return "success";
    case "PAUSED":
      return "warning";
    case "CANCELLED":
    case "OBSOLETE":
      return "danger";
    default:
      return "neutral";
  }
}

/** Status PERSISTIDO do projeto (ACTIVE/INACTIVE) → tone. Inativo é `neutral`,
 *  não `danger`: arquivar um projeto é decisão normal, não um problema. */
export function projectStatusTone(status: string): Tone {
  return status === "ACTIVE" ? "success" : "neutral";
}

/** Estado DERIVADO de conclusão (`computeProjectCompletion`) → tone. `pending`
 *  é neutro de propósito: um projeto em andamento não é um alerta. */
export function projectCompletionTone(state: string): Tone {
  switch (state) {
    case "completed":
      return "success";
    case "empty":
      return "warning"; // projeto sem nenhuma tarefa ativa — provável esquecimento
    default:
      return "neutral";
  }
}
