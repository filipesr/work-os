import type { Prisma } from "@prisma/client";

// Fechamento de um período de trabalho. NÃO é "use server": helper puro +
// escritor tx-scoped, importado pelas server actions e pelos testes.
//
// Por que existe: havia DOIS caminhos de fechamento e só um criava o TimeLog.
// O "Parar" manual registrava as horas; a troca automática de tarefa (iniciar B
// com A rodando) apenas carimbava `endedAt` — e o tempo de A **sumia**. Não
// aparecia no relatório de horas, não entrava na utilização, não contava em
// lugar nenhum. Um caminho só elimina a classe inteira do bug.

/** Horas trabalhadas entre início e fim, arredondadas a 2 casas. Puro. */
export function hoursBetween(startedAt: Date, endedAt: Date): number {
  const ms = endedAt.getTime() - startedAt.getTime();
  return Math.round((ms / 3.6e6) * 100) / 100;
}

/**
 * O TimeLog só é criado com duração positiva: um start/stop acidental de poucos
 * segundos arredonda para 0h e viraria uma linha de ruído no relatório de horas.
 */
export function shouldRecordTime(hours: number): boolean {
  return hours > 0;
}

interface CloseableLog {
  id: string;
  userId: string;
  taskId: string;
  stageId: string;
  startedAt: Date;
}

/** Cliente mínimo satisfeito por PrismaClient e por uma transação — mesmo padrão
 *  de lib/stage-transitions.ts e lib/task-start.ts. */
type CloseWriter = Pick<Prisma.TransactionClient, "activityLog" | "timeLog">;

/**
 * Fecha o período e **sempre** registra as horas. Único ponto de fechamento —
 * tanto o "Parar" manual quanto a interrupção por troca de tarefa passam aqui.
 *
 * `description` vira a descrição do TimeLog: opcional no Parar normal,
 * obrigatória na interrupção (a regra de obrigatoriedade vive na server action,
 * porque depende de haver ou não outra tarefa em curso).
 */
export async function closeActivityLog(
  client: CloseWriter,
  log: CloseableLog,
  endedAt: Date,
  description?: string | null
): Promise<{ hoursSpent: number; recorded: boolean }> {
  await client.activityLog.update({ where: { id: log.id }, data: { endedAt } });

  const hoursSpent = hoursBetween(log.startedAt, endedAt);
  const recorded = shouldRecordTime(hoursSpent);

  if (recorded) {
    await client.timeLog.create({
      data: {
        userId: log.userId,
        taskId: log.taskId,
        stageId: log.stageId,
        hoursSpent,
        logDate: endedAt,
        description: description?.trim() || null,
      },
    });
  }

  return { hoursSpent, recorded };
}
