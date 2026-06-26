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

/** Pre-creates ALL template stages for a task as TaskActiveStage rows.
 * The lowest-order stage starts ACTIVE (the workflow entry point, matching the
 * legacy createTask behaviour); the rest start INACTIVE. We key off `order`
 * rather than "no dependencies" because some templates wire their dependency
 * graph independently of order — `order` is the source of truth for the start.
 * Assignments are applied only when valid (assignee ∈ stage.defaultTeam).
 * A TaskStageLog is opened only for the initial ACTIVE stage.
 * Runs inside a caller-provided transaction; not a Server Action. */
export async function createTaskStages(
  tx: Prisma.TransactionClient,
  args: { taskId: string; templateId: string; userId: string; assignments?: Record<string, string> }
): Promise<void> {
  const { taskId, templateId, userId, assignments = {} } = args;

  const stages = await tx.templateStage.findMany({
    where: { templateId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      defaultTeamId: true,
      defaultTeam: { select: { members: { select: { id: true } } } },
    },
  });

  if (stages.length === 0) {
    throw new Error("Template is misconfigured; no stages found.");
  }

  // Lowest order (first after the asc sort) is the entry point.
  const startStageId = stages[0].id;

  for (const stage of stages) {
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
