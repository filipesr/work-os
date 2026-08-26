/**
 * "Tarefa virgem": a demanda existe, mas o trabalho ainda não começou.
 *
 * É a janela em que corrigir o desenho da demanda — quais etapas opcionais
 * entram, para qual time vai cada etapa coringa, com que instrução — ainda é
 * **livre**: nada foi executado, ninguém foi mobilizado, nenhum número foi
 * medido. Depois disso a mesma edição deixaria de ser correção e passaria a ser
 * reescrita: mudar o time de uma etapa já trabalhada moveria throughput e
 * on-time de um time para outro, falsificando a medição (P1/P2).
 *
 * A âncora é `Task.startedAt`, que já existe e é carimbado **uma única vez** na
 * primeira promoção para IN_PROGRESS (ver lib/task-start.ts) — ou seja,
 * literalmente "antes da tarefa iniciar". Não inventamos um predicado novo de
 * "teve interação", que precisaria decidir se comentário conta, se artefato
 * conta, e divergiria em cada tela nova.
 *
 * Além do carimbo, uma etapa com responsável também fecha a janela: alguém já
 * foi mobilizado para aquele trabalho, e re-rotear por baixo o deixaria preso a
 * uma etapa que passou a ser de outro time.
 *
 * Módulo plano de propósito: exporta função síncrona, então não pode ser
 * `"use server"`.
 */

/** Por que a edição está fechada. Null = ainda editável. */
export type VirginBlocker = "started" | "assigned" | "status";

export type VirginCheckInput = {
  status: string;
  startedAt: Date | null;
  activeStages: { assigneeId: string | null }[];
};

/** Devolve o motivo do bloqueio, ou null quando a demanda ainda é virgem.
 *  Devolver o MOTIVO (e não um booleano) é o que permite à tela dizer por que
 *  travou — "já iniciada" e "já tem responsável" pedem reações diferentes. */
export function taskVirginBlocker(task: VirginCheckInput): VirginBlocker | null {
  if (task.startedAt !== null) return "started";
  if (task.activeStages.some((s) => s.assigneeId !== null)) return "assigned";
  // Cancelada/obsoleta/concluída não é "virgem à espera de correção" — é
  // demanda encerrada, e reconfigurar o fluxo dela não teria efeito nenhum.
  if (task.status !== "BACKLOG") return "status";
  return null;
}

export function isTaskVirgin(task: VirginCheckInput): boolean {
  return taskVirginBlocker(task) === null;
}
