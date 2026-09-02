/**
 * A instrução da etapa, entregue no momento em que a etapa é liberada.
 *
 * `TaskActiveStage.instructions` é escrita na criação da demanda e aparece em três telas — mas
 * nunca no instante em que alguém vai executar. Instrução que ninguém lê na hora certa é instrução
 * perdida, e é isso que este comentário conserta.
 *
 * Puro e separado da action porque a decisão ("gera ou não gera, assinada por quem") é regra, e a
 * action é transação: misturá-las esconde a regra dentro de um `for` no meio de um `$transaction`.
 */
export function buildInstructionComments(input: {
  taskId: string;
  /** Quem gerou a demanda. Nulo nas anteriores a esta entrega — e aí nada é gerado, porque assinar
   *  em nome de alguém seria inventar autoria. */
  createdById: string | null;
  ativadas: { activeStageId: string; instructions: string | null }[];
}) {
  if (!input.createdById) return [];
  return input.ativadas
    .filter((a) => (a.instructions ?? "").trim().length > 0)
    .map((a) => ({
      taskId: input.taskId,
      userId: input.createdById as string,
      activeStageId: a.activeStageId,
      kind: "STAGE_INSTRUCTION" as const,
      content: (a.instructions as string).trim(),
    }));
}
