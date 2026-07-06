import { Prisma } from "@prisma/client";

// Pure / server-only helpers for stage assignment. NOT a "use server" module:
// it exports synchronous functions and a transaction-scoped helper that are
// imported by server code (lib/actions/task.ts) and unit tests — never invoked
// as Server Actions from the client. Client-callable actions live in
// lib/actions/stage-assignment.ts.

export type StageWithTeam = {
  id: string;
  defaultTeamId: string | null;
  defaultTeam: { members: { id: string }[] } | null;
};

/** True when `assigneeId` belongs to the stage's defaultTeam. Stages without a
 * team cannot be assigned. */
export function isValidStageAssignee(stage: StageWithTeam, assigneeId: string): boolean {
  if (!stage.defaultTeam) return false;
  return stage.defaultTeam.members.some((m) => m.id === assigneeId);
}

/**
 * Shared predicate for "is this stage ready to activate?": true when every
 * prerequisite stage id is present in `completedStageIds`. No prerequisites
 * means the stage is always ready. Pure — callers build the completed set once
 * (avoiding the per-prerequisite N+1) and decide how to treat the stage being
 * completed: the mutating path (activateNextStages) has already written it as
 * COMPLETED, while the read-only preview adds it to the set explicitly.
 */
export function areAllPrerequisitesComplete(
  prerequisiteStageIds: readonly string[],
  completedStageIds: ReadonlySet<string>
): boolean {
  return prerequisiteStageIds.every((id) => completedStageIds.has(id));
}

/** Reads `stage:<stageId>` checkbox fields; returns the set of CHECKED stageIds.
 * Unchecked checkboxes are simply absent from FormData, so presence = selected. */
export function parseSelectedStages(formData: FormData): Set<string> {
  const out = new Set<string>();
  for (const key of formData.keys()) {
    if (key.startsWith("stage:")) out.add(key.slice("stage:".length));
  }
  return out;
}

/** Reads `assignee:<stageId>` form fields into a { stageId: assigneeId } map,
 * skipping empty values (= "no assignment"). */
export function parseStageAssignments(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("assignee:")) continue;
    const stageId = key.slice("assignee:".length);
    const assigneeId = typeof value === "string" ? value.trim() : "";
    if (stageId && assigneeId) out[stageId] = assigneeId;
  }
  return out;
}

/** Pre-creates the INCLUDED template stages for a task as TaskActiveStage rows.
 *
 * Which stages are included:
 *   - `selectedStageIds` given (create form) → exactly those stages.
 *   - `selectedStageIds` omitted (batch create, no per-stage UI) → all
 *     NON-optional stages (optional stages default to "off").
 * Excluded stages get NO row at all — the workflow engine treats "stage without
 * a row for this task" as not part of the task (see computeStageReadiness).
 *
 * The lowest-order INCLUDED stage starts ACTIVE (the workflow entry point); the
 * rest start INACTIVE. We key off `order` (source of truth for the start) rather
 * than "no dependencies". Assignments apply only when valid (assignee ∈
 * stage.defaultTeam). A TaskStageLog is opened only for the initial ACTIVE stage.
 * Runs inside a caller-provided transaction; not a Server Action. */
export async function createTaskStages(
  tx: Prisma.TransactionClient,
  args: {
    taskId: string;
    templateId: string;
    userId: string;
    assignments?: Record<string, string>;
    selectedStageIds?: ReadonlySet<string>;
  }
): Promise<void> {
  const { taskId, templateId, userId, assignments = {}, selectedStageIds } = args;

  const stages = await tx.templateStage.findMany({
    where: { templateId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      optional: true,
      defaultTeamId: true,
      defaultTeam: { select: { members: { select: { id: true } } } },
    },
  });

  if (stages.length === 0) {
    throw new Error("Template is misconfigured; no stages found.");
  }

  // Included = explicitly selected (create form) OR, when no selection is given
  // (batch), every non-optional stage.
  const included = stages.filter((s) =>
    selectedStageIds ? selectedStageIds.has(s.id) : !s.optional
  );
  if (included.length === 0) {
    throw new Error("At least one stage must be included in the task.");
  }

  // Lowest order among the INCLUDED stages (already sorted asc) is the entry point.
  const startStageId = included[0].id;

  for (const stage of included) {
    const isStart = stage.id === startStageId;
    const requested = assignments[stage.id];
    const assigneeId = requested && isValidStageAssignee(stage, requested) ? requested : null;

    await tx.taskActiveStage.create({
      data: {
        taskId,
        stageId: stage.id,
        status: isStart ? "ACTIVE" : "INACTIVE",
        assigneeId,
      },
    });

    if (isStart) {
      await tx.taskStageLog.create({
        data: { taskId, stageId: stage.id, enteredAt: new Date(), exitedAt: null, userId },
      });
    }
  }
}
