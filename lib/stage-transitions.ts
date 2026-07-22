import type { Prisma, ActiveStageStatus } from "@prisma/client";

// Append-only stage-transition log + pure reconstruction of time-in-status.
// NOT a "use server" module: exports sync helpers + a tx-scoped writer imported
// by server code (lib/actions/task.ts, stage-assignment-helpers.ts) and tests.
//
// Why this exists: a stage's flow efficiency = time ACTIVE ("touched") vs time
// BLOCKED ("waiting on dependencies"). The single overwritable timestamps on
// TaskActiveStage (activatedAt/blockedAt) cannot retain per-period durations
// across block/unblock or revert cycles, so we log every status ENTRY and
// reconstruct durations by pairing consecutive rows.

/** Minimal client shape satisfied by both PrismaClient and a transaction. */
type TransitionWriter = Pick<Prisma.TransactionClient, "stageTransition">;

/** Append one transition row: the stage ENTERED `status` now. Call AFTER the
 * TaskActiveStage status write, on the SAME client/transaction. */
export async function recordStageTransition(
  client: TransitionWriter,
  taskId: string,
  stageId: string,
  status: ActiveStageStatus
): Promise<void> {
  await client.stageTransition.create({ data: { taskId, stageId, status } });
}

/** Append the same `status` entry for several stages of one task (e.g. the
 * revert reset that pushes downstream stages back to INACTIVE). */
export async function recordStageTransitions(
  client: TransitionWriter,
  taskId: string,
  stageIds: string[],
  status: ActiveStageStatus
): Promise<void> {
  if (stageIds.length === 0) return;
  await client.stageTransition.createMany({
    data: stageIds.map((stageId) => ({ taskId, stageId, status })),
  });
}

export type TransitionRow = { status: ActiveStageStatus; at: Date };

export type StatusDurations = Record<ActiveStageStatus, number>;

/**
 * Milliseconds spent in each status for ONE (task, stage), reconstructed by
 * pairing consecutive transitions sorted ascending by `at`. Each row accrues
 * time until the next row; the final row accrues up to `now` UNLESS it is
 * COMPLETED (terminal — the stage is done, no further time accrues).
 *
 * Rows out of order are tolerated (sorted internally). Empty input → all zeros.
 */
export function statusDurations(rows: TransitionRow[], now: number = Date.now()): StatusDurations {
  const out: StatusDurations = { INACTIVE: 0, ACTIVE: 0, BLOCKED: 0, COMPLETED: 0 };
  if (rows.length === 0) return out;

  const sorted = [...rows].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].at.getTime();
    const isLast = i === sorted.length - 1;
    // Terminal COMPLETED accrues nothing further; every other open row runs to now.
    const end = isLast
      ? sorted[i].status === "COMPLETED"
        ? start
        : now
      : sorted[i + 1].at.getTime();
    const delta = end - start;
    if (delta > 0) out[sorted[i].status] += delta;
  }
  return out;
}

/**
 * The status of ONE (task, stage) instance as of time `t` (ms): the status of
 * the latest transition at or before `t`, or null if the instance had not been
 * created yet. Powers the status-band CFD (count instances per status per day
 * by replaying the transition log). Rows need not be pre-sorted.
 */
export function statusAt(rows: TransitionRow[], t: number): ActiveStageStatus | null {
  let best: TransitionRow | null = null;
  for (const r of rows) {
    const ms = r.at.getTime();
    if (ms <= t && (best === null || ms > best.at.getTime())) best = r;
  }
  return best ? best.status : null;
}

/**
 * Flow efficiency = ACTIVE ÷ (ACTIVE + BLOCKED) — the fraction of "reached"
 * time the item was workable vs. waiting on dependencies. INACTIVE (not yet
 * reached) and COMPLETED (terminal) are excluded by construction. Returns null
 * when the item never accrued reached time (denominator 0) — undefined, not 0%.
 */
export function flowEfficiencyRatio(activeMs: number, blockedMs: number): number | null {
  const denom = activeMs + blockedMs;
  if (denom <= 0) return null;
  return activeMs / denom;
}
