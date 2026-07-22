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
