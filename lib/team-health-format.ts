/** Compact age label, locale-neutral: "5h", "2d", "2d 2h". */
export function formatAge(hours: number): string {
  const total = Math.max(0, Math.floor(hours));
  const d = Math.floor(total / 24);
  const h = total % 24;
  if (d === 0) return `${h}h`;
  if (h === 0) return `${d}d`;
  return `${d}d ${h}h`;
}

/**
 * Dependency risk for a blocked item, from the number of PENDING prerequisites
 * it is still waiting on. Grounded in the compounding-dependency heuristic
 * (Magennis, via DeGrandis): each unmet dependency multiplies the chance of
 * being late, so more pending prerequisites = disproportionately higher risk.
 * Qualitative on purpose — we surface a signal, not a false-precision estimate.
 *   0–1 pending → low · 2 → medium · 3+ → high
 */
export function dependencyRiskLevel(pendingDeps: number): "low" | "medium" | "high" {
  if (pendingDeps >= 3) return "high";
  if (pendingDeps === 2) return "medium";
  return "low";
}

export type LoadTier = "idle" | "healthy" | "high" | "overloaded";

/**
 * Load meter for one member's WIP, coherent with the card's summary (WIP /
 * overload / median). `fillPct` is the WIP as a fraction of the overload
 * ceiling (clamped to 100% — anyone at/over the ceiling fills the bar). `tier`
 * colors it by load magnitude:
 *   - overloaded: the row is flagged overloaded (absolute ceiling OR relative rule)
 *   - high: approaching the ceiling (≥ 75% of it)
 *   - idle: no active WIP
 *   - healthy: everything else
 * Pure — the caller passes the ceiling (OVERLOAD_CEILING) so this file stays
 * free of server imports.
 */
export function loadMeter(
  row: { count: number; overloaded: boolean },
  ceiling: number
): { fillPct: number; tier: LoadTier } {
  const safeCeiling = ceiling > 0 ? ceiling : 1;
  const fillPct = Math.min(row.count / safeCeiling, 1) * 100;
  let tier: LoadTier;
  if (row.overloaded) tier = "overloaded";
  else if (row.count === 0) tier = "idle";
  else if (row.count >= Math.ceil(safeCeiling * 0.75)) tier = "high";
  else tier = "healthy";
  return { fillPct, tier };
}

/** Position (percent) of the team-median marker on the same 0..ceiling scale. */
export function medianMarkerPct(medianWip: number, ceiling: number): number {
  const safeCeiling = ceiling > 0 ? ceiling : 1;
  return Math.min(medianWip / safeCeiling, 1) * 100;
}

/** Utilização = horas ÷ (capacidade semanal × semanas do período). Null quando
 * não há meta de capacidade ou período válido — indefinido, não 0. Puro. */
export function utilizationRatio(
  hours: number,
  weeklyCapacityHours: number | null,
  periodWeeks: number | null
): number | null {
  if (!weeklyCapacityHours || weeklyCapacityHours <= 0 || !periodWeeks || periodWeeks <= 0) {
    return null;
  }
  return hours / (weeklyCapacityHours * periodWeeks);
}

export type UtilizationPosition = "below" | "inside" | "above";

/**
 * Geometria do medidor de utilização: onde cai a pessoa numa régua `0..scaleMax`
 * e onde fica a faixa de referência sombreada. Puro — o caller passa a faixa e a
 * escala (`lib/reporting-constants.ts`), como em `loadMeter`.
 *
 * Por que medidor e não um número colorido: pintar >90% de vermelho e 60–90% de
 * verde transforma um sinal de capacidade em NOTA — verde "boa", vermelho "ruim"
 * — que é exatamente o que P7 e P1 proíbem. Aqui a informação está na POSIÇÃO
 * (dá para ver o quanto está fora, e para que lado), e a cor não julga. `position`
 * existe só para rótulo textual/leitor de tela, nunca para escolher cor de alarme.
 *
 * `markerPct` é clampado à régua: quem estourar muito encosta em 100% em vez de
 * transbordar o container — o número exato continua ao lado, sem distorcer a barra.
 */
export function utilizationMeter(
  utilization: number,
  band: { min: number; max: number; scaleMax: number }
): {
  markerPct: number;
  bandStartPct: number;
  bandWidthPct: number;
  position: UtilizationPosition;
} {
  const scaleMax = band.scaleMax > 0 ? band.scaleMax : 1;
  const pct = (value: number) => Math.min(Math.max(value / scaleMax, 0), 1) * 100;

  const bandStartPct = pct(band.min);
  const position: UtilizationPosition =
    utilization < band.min ? "below" : utilization > band.max ? "above" : "inside";

  return {
    markerPct: pct(utilization),
    bandStartPct,
    bandWidthPct: Math.max(0, pct(band.max) - bandStartPct),
    position,
  };
}

/**
 * ageHours / slaHours para uma etapa ativa — `>= 1` significa que passou do SLA
 * (envelhecendo). Puro; o caller resolve o SLA (ex.: `expectedDurationHours ??
 * DEFAULT_SLA_HOURS`). Compartilhado por getAgingStages/getMyFocus, StatsCards e
 * a tabela de etapas.
 */
export function stageAgingRatio(
  activatedAt: Date,
  slaHours: number,
  now: number = Date.now()
): number {
  return (now - activatedAt.getTime()) / 3.6e6 / slaHours;
}

/** A collaborator's active stage, for the load drill-down drawer. */
export interface MemberStage {
  taskId: string;
  /** `TaskActiveStage.id` — a instância desta etapa NESTA demanda, não o id do template. Precisa
   *  viajar até o componente para montar o link para a tela da etapa (`stagePath`). */
  activeStageId: string;
  taskTitle: string;
  stageName: string;
  /** Task creation date (ISO string). */
  createdAt: string;
  /** When this stage was activated for the collaborator — proxy for the
   * assignment date (ISO string). */
  assignedAt: string;
  /** Task due date (ISO string), or null. */
  dueDate: string | null;
  dueState: "overdue" | "dueSoon" | "none";
}
