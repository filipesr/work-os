/**
 * Percentile (linear interpolation between closest ranks, like Excel
 * PERCENTILE.INC) of a numeric list. `p` is a fraction in [0, 1]. Empty list
 * returns 0. Input need not be pre-sorted (sorted internally). Used for cycle
 * time percentiles (p50/p85/p95) — the basis of committing to a confident date
 * at the 85th percentile instead of an average.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const clamped = Math.min(1, Math.max(0, p));
  const rank = clamped * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}
