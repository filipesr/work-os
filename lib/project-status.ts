/**
 * Derived project-completion status. There is NO persisted completion column on
 * `Project` — this is computed on-read from the project's task statuses so the
 * rule lives in a single place (used by the client project list and the project
 * detail page).
 *
 * Regras (spec 2026-07-06-task-project-completion-design):
 * - `completed` = tarefas COMPLETED; `cancelled` = tarefas CANCELLED.
 * - denominador = tarefas não-canceladas; `pct` = round(completed / nonCancelled * 100).
 * - `state`:
 *   - `empty`     → nenhuma tarefa não-cancelada (não conta como concluído nem no cálculo).
 *   - `completed` → há tarefas não-canceladas e TODAS estão COMPLETED.
 *   - `pending`   → caso contrário.
 */
export type ProjectCompletionState = "empty" | "pending" | "completed";

export interface ProjectCompletion {
  total: number;
  completed: number;
  cancelled: number;
  pct: number;
  state: ProjectCompletionState;
}

export function computeProjectCompletion(tasks: { status: string }[]): ProjectCompletion {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const cancelled = tasks.filter((t) => t.status === "CANCELLED").length;
  const nonCancelled = total - cancelled;

  const pct = nonCancelled === 0 ? 0 : Math.round((completed / nonCancelled) * 100);

  let state: ProjectCompletionState;
  if (nonCancelled === 0) {
    state = "empty";
  } else if (completed === nonCancelled) {
    state = "completed";
  } else {
    state = "pending";
  }

  return { total, completed, cancelled, pct, state };
}
