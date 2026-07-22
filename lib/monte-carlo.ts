import { percentile } from "@/lib/stats";

// Monte Carlo delivery forecasting — pure, deterministic under a seeded RNG.
// Samples the historical per-day throughput distribution repeatedly to answer
// "when will the backlog be done?" and "how many items ship by date X?" as
// probability ranges (commit at the 85th percentile), instead of a single
// deterministic estimate. Needs only history the workos already has.

/** mulberry32 seeded PRNG factory → () => float in [0,1). Deterministic per
 * seed, so forecasts are reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ForecastResult {
  p50: number;
  p85: number;
  p95: number;
}

interface ForecastOpts {
  trials?: number;
  rng?: () => number;
}

// Guard against a pathological run (mostly-zero samples) looping forever.
const DAYS_CAP = 100_000;

/**
 * Days to finish `backlog` items, forecast by sampling `samples` (per-day
 * throughput, INCLUDING zero-throughput days) once per simulated day until the
 * backlog is drained. Returns p50/p85/p95 of the day counts, or null when the
 * history can never finish it (every sample is 0). backlog ≤ 0 → all zeros.
 */
export function forecastWhen(
  samples: number[],
  backlog: number,
  opts: ForecastOpts = {}
): ForecastResult | null {
  if (backlog <= 0) return { p50: 0, p85: 0, p95: 0 };
  if (samples.length === 0) return null;
  const maxSample = Math.max(...samples);
  if (!(maxSample > 0)) return null; // no throughput ever → cannot finish

  const trials = opts.trials ?? 10_000;
  const rng = opts.rng ?? Math.random;
  const results: number[] = new Array(trials);

  for (let t = 0; t < trials; t++) {
    let remaining = backlog;
    let days = 0;
    while (remaining > 0 && days < DAYS_CAP) {
      remaining -= samples[Math.floor(rng() * samples.length)];
      days++;
    }
    results[t] = days;
  }

  return {
    p50: percentile(results, 0.5),
    p85: percentile(results, 0.85),
    p95: percentile(results, 0.95),
  };
}

/**
 * How many items ship within `horizonDays`, forecast by summing that many
 * random daily-throughput draws per trial. Returns p50/p85/p95 of the counts.
 * Note the ordering intuition: here a HIGHER percentile is an optimistic count,
 * whereas in forecastWhen a higher percentile is a later (pessimistic) date.
 */
export function forecastHowMany(
  samples: number[],
  horizonDays: number,
  opts: ForecastOpts = {}
): ForecastResult {
  if (horizonDays <= 0 || samples.length === 0) return { p50: 0, p85: 0, p95: 0 };
  const trials = opts.trials ?? 10_000;
  const rng = opts.rng ?? Math.random;
  const results: number[] = new Array(trials);

  for (let t = 0; t < trials; t++) {
    let sum = 0;
    for (let d = 0; d < horizonDays; d++) {
      sum += samples[Math.floor(rng() * samples.length)];
    }
    results[t] = sum;
  }

  return {
    p50: percentile(results, 0.5),
    p85: percentile(results, 0.85),
    p95: percentile(results, 0.95),
  };
}
