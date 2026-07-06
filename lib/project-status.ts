/**
 * Derived project-completion status. There is NO persisted completion column on
 * `Project` — this is computed on-read from the project's task statuses so the
 * rule lives in a single place (used by the client project list and the project
 * detail page).
 *
 * Regras (spec 2026-07-06-task-project-completion-design):
 * - `completed` = tarefas COMPLETED.
 * - descartadas = CANCELLED + OBSOLETE (fora do denominador e nunca "completed").
 * - denominador = tarefas ativas (total - descartadas); `pct` = round(completed / ativas * 100).
 * - `state`:
 *   - `empty`     → nenhuma tarefa ativa (não conta como concluído nem no cálculo).
 *   - `completed` → há tarefas ativas e TODAS estão COMPLETED.
 *   - `pending`   → caso contrário.
 */
export type ProjectCompletionState = "empty" | "pending" | "completed";

export interface ProjectCompletion {
  total: number;
  completed: number;
  cancelled: number;
  obsolete: number;
  pct: number;
  state: ProjectCompletionState;
}

export function computeProjectCompletion(tasks: { status: string }[]): ProjectCompletion {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const cancelled = tasks.filter((t) => t.status === "CANCELLED").length;
  const obsolete = tasks.filter((t) => t.status === "OBSOLETE").length;
  const active = total - cancelled - obsolete; // denominador

  const pct = active === 0 ? 0 : Math.round((completed / active) * 100);

  let state: ProjectCompletionState;
  if (active === 0) {
    state = "empty";
  } else if (completed === active) {
    state = "completed";
  } else {
    state = "pending";
  }

  return { total, completed, cancelled, obsolete, pct, state };
}
