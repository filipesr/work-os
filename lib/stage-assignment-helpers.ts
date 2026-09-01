import { Prisma } from "@prisma/client";
import { recordStageTransition } from "@/lib/stage-transitions";

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

/** Formato mínimo para resolver a elegibilidade pelo time EFETIVO. */
export type StageWithEffectiveTeam = {
  teamId?: string | null;
  team?: { id: string; members: { id: string }[] } | null;
  stage?: { defaultTeam?: { id: string; members: { id: string }[] } | null } | null;
};

/**
 * Quem pode receber a etapa: membro do time EFETIVO — o roteamento da demanda, senão o padrão do
 * modelo (a regra de `lib/stage-team.ts`).
 *
 * Diferente de `isValidStageAssignee`, que olha só `defaultTeam` e por isso RECUSARIA a pessoa
 * certa numa etapa coringa roteada para outro time. As duas convivem porque respondem a perguntas
 * de momentos diferentes: aquela valida o desenho da demanda na criação, esta valida a atribuição
 * de uma etapa que já existe e já pode ter sido roteada.
 *
 * Etapa SEM time efetivo — coringa que ninguém direcionou — não tem regra a violar: qualquer pessoa
 * serve. Recusar aqui tiraria da mesa a única porta que hoje programa essas etapas, e por uma regra
 * que não existe.
 */
export function isEffectiveTeamMember(row: StageWithEffectiveTeam, userId: string): boolean {
  const time = row.team ?? row.stage?.defaultTeam ?? null;
  if (!time) return true;
  return time.members.some((m) => m.id === userId);
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

/**
 * Recomputes stage readiness for a task after a stage completes. Pure — the
 * caller loads the task's rows + the template graph and applies the result.
 *
 * A prerequisite is "satisfied" when it is COMPLETED **or** not included in this
 * task (excluded stages have no row). That single rule makes the pass-through
 * through excluded middle stages fall out naturally: if B is excluded, any stage
 * depending on B treats B as already satisfied.
 *
 * Returns, for each INCLUDED stage currently INACTIVE/BLOCKED, its recomputed
 * status:
 *   - ACTIVE  when every prerequisite is satisfied;
 *   - BLOCKED when not ready but the stage was "reached" (≥1 INCLUDED
 *     prerequisite already COMPLETED) — i.e. it is genuinely waiting.
 * Stages that stay INACTIVE (not ready, not reached) and stages already
 * ACTIVE/COMPLETED are omitted (no-regress). The caller diffs against the
 * current status to decide what to write.
 */
export function computeStageReadiness(args: {
  stages: { id: string; dependsOnIds: string[] }[];
  includedStageIds: ReadonlySet<string>;
  completedStageIds: ReadonlySet<string>;
  statusByStage: ReadonlyMap<string, "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED">;
}): Map<string, "ACTIVE" | "BLOCKED"> {
  const { stages, includedStageIds, completedStageIds, statusByStage } = args;
  const isSatisfied = (id: string) => completedStageIds.has(id) || !includedStageIds.has(id);
  const out = new Map<string, "ACTIVE" | "BLOCKED">();

  for (const stage of stages) {
    if (!includedStageIds.has(stage.id)) continue; // excluded: no row for this task
    const current = statusByStage.get(stage.id);
    if (current === "ACTIVE" || current === "COMPLETED") continue; // no-regress

    if (stage.dependsOnIds.every(isSatisfied)) {
      out.set(stage.id, "ACTIVE");
    } else {
      // "Reached" = some INCLUDED prerequisite is already COMPLETED.
      const reached = stage.dependsOnIds.some(
        (id) => includedStageIds.has(id) && completedStageIds.has(id)
      );
      if (reached) out.set(stage.id, "BLOCKED");
    }
  }
  return out;
}

/** Reads `team:<stageId>` form fields into a { stageId: teamId } map, skipping
 * empty values. Só as etapas CORINGA (sem `defaultTeamId`) postam este campo —
 * o roteamento delas é decidido na criação, não no template. */
export function parseStageTeams(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("team:")) continue;
    const stageId = key.slice("team:".length);
    const teamId = typeof value === "string" ? value.trim() : "";
    if (stageId && teamId) out[stageId] = teamId;
  }
  return out;
}

/** Reads `instructions:<stageId>` form fields into a { stageId: text } map.
 * O que precisa ser feito naquela instância da etapa coringa — direcionamento
 * do gestor, não conversa (discussão continua nos comentários da tarefa). */
export function parseStageInstructions(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("instructions:")) continue;
    const stageId = key.slice("instructions:".length);
    const text = typeof value === "string" ? value.trim() : "";
    if (stageId && text) out[stageId] = text;
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
 * than "no dependencies". A TaskStageLog is opened only for the initial ACTIVE
 * stage. Runs inside a caller-provided transaction; not a Server Action.
 *
 * Roteamento (`teams`) e instruções (`instructions`) só valem para etapas
 * CORINGA — as que o template deixou sem `defaultTeamId`. Numa etapa que já tem
 * time padrão o override é ignorado em silêncio: quem decide o fluxo dela é o
 * template, e deixar a criação sobrescrever transformaria cada demanda numa
 * variante do processo, que é exatamente o que o template existe para evitar.
 *
 * Assignments valem quando o responsável pertence ao time EFETIVO da etapa
 * (override, senão o padrão) — atribuir alguém a um time que não é o dela seria
 * criar trabalho que não aparece na fila de ninguém. */
export async function createTaskStages(
  tx: Prisma.TransactionClient,
  args: {
    taskId: string;
    templateId: string;
    userId: string;
    assignments?: Record<string, string>;
    selectedStageIds?: ReadonlySet<string>;
    /** { stageId: teamId } — roteamento das etapas coringa, vindo da criação. */
    teams?: Record<string, string>;
    /** { stageId: texto } — o que precisa ser feito naquela etapa coringa. */
    instructions?: Record<string, string>;
  }
): Promise<{ initialAssigned: boolean }> {
  const {
    taskId,
    templateId,
    userId,
    assignments = {},
    selectedStageIds,
    teams = {},
    instructions = {},
  } = args;

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

  // Roteamento válido = etapa coringa (sem time padrão) + time existente. A
  // consulta dos membros só acontece quando há override — o caso comum (todas
  // as etapas com time padrão) não paga por ela.
  const routable = new Map<string, string>();
  for (const stage of included) {
    const requestedTeam = teams[stage.id];
    if (requestedTeam && !stage.defaultTeamId) routable.set(stage.id, requestedTeam);
  }
  const membersByTeam = new Map<string, Set<string>>();
  if (routable.size > 0) {
    const rows = await tx.team.findMany({
      where: { id: { in: [...new Set(routable.values())] } },
      select: { id: true, members: { select: { id: true } } },
    });
    for (const team of rows) membersByTeam.set(team.id, new Set(team.members.map((m) => m.id)));
  }

  // Lowest order among the INCLUDED stages (already sorted asc) is the entry point.
  const startStageId = included[0].id;
  let initialAssigned = false;

  for (const stage of included) {
    const isStart = stage.id === startStageId;

    // Time inexistente vira "sem roteamento" em vez de erro: a etapa reaparece
    // como coringa não-direcionada (visível e corrigível) em vez de derrubar a
    // criação da demanda inteira.
    const requestedTeam = routable.get(stage.id);
    const teamId = requestedTeam && membersByTeam.has(requestedTeam) ? requestedTeam : null;

    const requested = assignments[stage.id];
    const allowed = teamId
      ? (membersByTeam.get(teamId) ?? new Set<string>())
      : new Set((stage.defaultTeam?.members ?? []).map((m) => m.id));
    const assigneeId = requested && allowed.has(requested) ? requested : null;
    if (isStart && assigneeId) initialAssigned = true;

    // Instrução só faz sentido onde o template não diz o que fazer.
    const note = stage.defaultTeamId ? undefined : instructions[stage.id];

    await tx.taskActiveStage.create({
      data: {
        taskId,
        stageId: stage.id,
        status: isStart ? "ACTIVE" : "INACTIVE",
        assigneeId,
        ...(teamId ? { teamId } : {}),
        ...(note ? { instructions: note } : {}),
        ...(assigneeId ? { assignedAt: new Date() } : {}),
      },
    });
    // Anchor the transition log at creation so the first real transition pairs
    // correctly (the entry stage starts ACTIVE; the rest start INACTIVE).
    await recordStageTransition(tx, taskId, stage.id, isStart ? "ACTIVE" : "INACTIVE");

    if (isStart) {
      await tx.taskStageLog.create({
        data: { taskId, stageId: stage.id, enteredAt: new Date(), exitedAt: null, userId },
      });
    }
  }

  return { initialAssigned };
}
