import type { Prisma } from "@prisma/client";

// Carimbo write-once do início da tarefa (Task.startedAt).
// NOT a "use server" module: exporta um writer tx-scoped importado por server
// code (lib/actions/task.ts) e testes — mesma forma de lib/stage-transitions.ts.
//
// Por que existe: até aqui lead time e cycle time usavam a MESMA fórmula
// (completedAt − createdAt), porque o instante em que a tarefa saía da fila não
// era persistido em lugar nenhum. Com startedAt:
//
//   lead time  = completedAt − createdAt   (demanda → entrega)
//   cycle time = completedAt − startedAt   (início  → entrega)
//   queue time = startedAt   − createdAt   (espera na fila)

/** Minimal client shape satisfied by both PrismaClient and a transaction. */
type TaskStartWriter = Pick<Prisma.TransactionClient, "task">;

/**
 * Carimba o início da tarefa na PRIMEIRA promoção para IN_PROGRESS. Chamar em
 * TODO ponto que promove a tarefa; as chamadas seguintes são no-ops.
 *
 * `updateMany` com `startedAt: null` no where é um compare-and-set atômico: sem
 * read-then-write, seguro sob concorrência (dois claims simultâneos não geram
 * dois carimbos) e idempotente. Um `update` simples sobrescreveria o valor a
 * cada re-promoção — inclusive depois de uma reversão de tarefa concluída, o
 * que reiniciaria a contagem. Retrabalho deve ALONGAR o cycle time, não zerá-lo.
 */
export async function markTaskStarted(client: TaskStartWriter, taskId: string): Promise<void> {
  await client.task.updateMany({
    where: { id: taskId, startedAt: null },
    data: { startedAt: new Date() },
  });
}
