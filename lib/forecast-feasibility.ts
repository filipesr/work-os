// Pure feasibility check for reference-class forecasting: compares the days
// AVAILABLE until a chosen due date against the class (work-type) distribution.
// Informational only — never a score. Verdict tiers mirror the p50/p85 percentiles.

export type Feasibility = "comfortable" | "tight" | "atRisk" | "unknown";

/**
 * `daysAvailable` = dueDate − today (may be negative if past due). p50/p85 are
 * the class cycle-time percentiles in days. `unknown` when the class has no
 * usable distribution (p85 <= 0).
 *   available >= p85 → comfortable · available >= p50 → tight · else → atRisk
 */
export function assessFeasibility(daysAvailable: number, p50: number, p85: number): Feasibility {
  if (p85 <= 0) return "unknown";
  if (daysAvailable >= p85) return "comfortable";
  if (daysAvailable >= p50) return "tight";
  return "atRisk";
}

/** Days before the due date the work would ideally start to hit p85. */
export function idealStartOffsetDays(p85: number): number {
  return Math.max(0, Math.ceil(p85));
}

/** Etapa de "entrada" real para a seleção da banda: a primeira etapa AINDA
 * incluída na ordem do preview. Etapas opcionais nascem desmarcadas, então uma
 * primeira etapa opcional passa a entrada para a próxima incluída; desmarcar uma
 * etapa re-deriva ao vivo. Retorna null quando nenhuma está incluída. Puro. */
export function firstIncludedStageId(
  stages: ReadonlyArray<{ id: string }>,
  included: Record<string, boolean>
): string | null {
  return stages.find((s) => included[s.id])?.id ?? null;
}

/** Dias do percentil "confiável" segundo a experiência do responsável no tipo:
 * experiente → p85; novo/desconhecido → p95 (banda mais larga). Puro.
 * Experiência é LARGURA DE BANDA (P4), nunca nota individual. */
export function confidentDays(p85: number, p95: number, experienced: boolean): number {
  return experienced ? p85 : p95;
}

/** Nº de etapas concluídas no tipo a partir do qual a pessoa conta como
 * "experiente" (banda p85 em vez de p95). Abaixo disso = "novo neste tipo".
 * Vive num módulo puro (não "use server") para poder ser importado por client,
 * server actions e testes sem violar a regra de export do "use server". */
export const EXPERIENCE_THRESHOLD = 3;
