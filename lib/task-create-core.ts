import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import { createTaskStages } from "@/lib/stage-assignment-helpers";
import { markTaskStarted } from "@/lib/task-start";

// Miolo transacional da criação de demanda — extraído de `createTask`
// (lib/actions/task.ts) para ser reusável fora de uma requisição, sem
// `redirect()`, sem sessão e sem `revalidatePath` (todos do mundo da
// requisição, ficam na action). Chamador: a Server Action `createTask` E, no
// futuro, o script de importação do histórico do Trello — daí os campos
// opcionais abaixo, todos com padrão igual ao comportamento de hoje.
//
// NOT a "use server" module: exporta uma função síncrona ao redor de uma
// transação, chamada de dentro de `prisma.$transaction` pelo chamador — mesma
// forma de `lib/stage-assignment-helpers.ts` e `lib/task-start.ts`.

export interface CreateTaskCoreInput {
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueDate: Date | null;
  projectId: string;
  templateId: string;
  userId: string;
  /** Padrão: BACKLOG (o produto). A importação passa o status real da tarefa
   * importada, incluindo estados que a criação normal nunca produz. */
  status?: TaskStatus;
  /** Só faz sentido quando `status === "COMPLETED"`. */
  completedAt?: Date | null;
  /** A importação data a demanda no passado; sem isto, `Task.createdAt` usa o
   * default do banco (agora). */
  createdAt?: Date;
  assignments?: Record<string, string>;
  selectedStageIds?: ReadonlySet<string>;
  teams?: Record<string, string>;
  instructions?: Record<string, string>;
  /** Repassado a `createTaskStages`/`markTaskStarted`: quando as etapas e o
   * início "aconteceram". Padrão: agora. */
  at?: Date;
}

export async function createTaskCore(
  tx: Prisma.TransactionClient,
  input: CreateTaskCoreInput
): Promise<{ id: string; initialAssigned: boolean }> {
  const {
    title,
    description,
    priority,
    dueDate,
    projectId,
    templateId,
    userId,
    status,
    completedAt,
    createdAt,
    assignments,
    selectedStageIds,
    teams,
    instructions,
    at,
  } = input;

  const newTask = await tx.task.create({
    data: {
      title,
      description,
      priority,
      dueDate,
      status: status ?? "BACKLOG",
      projectId,
      workflowTemplateId: templateId,
      // Quem gerou a demanda assina a instrução das etapas dela — inclusive as que outra pessoa
      // vai executar. É por isso que este campo existe.
      createdById: userId,
      ...(completedAt !== undefined ? { completedAt } : {}),
      ...(createdAt !== undefined ? { createdAt } : {}),
    },
  });

  const { initialAssigned } = await createTaskStages(tx, {
    taskId: newTask.id,
    templateId,
    userId,
    assignments,
    selectedStageIds,
    teams,
    instructions,
    at,
  });

  // Pré-atribuir a etapa inicial na criação já coloca a tarefa em andamento:
  // o fluxo de "reivindicar" (que promove BACKLOG→IN_PROGRESS) não roda quando
  // a etapa já nasce com responsável, então a tarefa ficaria presa em BACKLOG.
  if (initialAssigned) {
    await tx.task.update({ where: { id: newTask.id }, data: { status: "IN_PROGRESS" } });
    // Começou na criação → startedAt == createdAt, ou seja, queue time zero.
    // É a leitura correta: ninguém esperou na fila, o trabalho já tinha dono.
    await markTaskStarted(tx, newTask.id, at);
  }

  return { id: newTask.id, initialAssigned };
}
