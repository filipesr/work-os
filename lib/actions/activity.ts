"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { requireMemberOrHigher } from "@/lib/permissions";
import { requirePresenceRead } from "@/lib/presence-access";
import { closeActivityLog } from "@/lib/activity-close";

// Helper to get current user
async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: You must be logged in");
  }
  return session.user;
}

/**
 * Inicia o trabalho numa tarefa — no máximo UMA por pessoa de cada vez.
 *
 * Se já houver outra tarefa em curso, ela é INTERROMPIDA: fechada com registro
 * das horas e com a justificativa como descrição. A justificativa é
 * **obrigatória** nesse caso (decisão do produto): trocar de tarefa no meio é
 * exatamente o momento em que o contexto se perde, e é o único registro de por
 * que aquele bloco de tempo foi cortado.
 *
 * Retorna `needsReason` quando falta o motivo, para a UI abrir o diálogo. A
 * checagem é do servidor: a UI já sabe que há outra ativa e abre o modal antes,
 * mas a regra não pode depender de a UI se comportar.
 *
 * A exclusividade também é garantida pelo BANCO, por índice único em
 * `ActivityLog.openForUserId` — o campo carrega o `userId` enquanto o período
 * está aberto e volta a null ao fechar. Sem isso, dois cliques simultâneos
 * abririam dois cronômetros: a checagem acima lê antes de escrever, e duas
 * transações concorrentes leem "nenhuma ativa" ao mesmo tempo.
 */
export async function startWorkOnTask(
  taskId: string,
  currentStageId: string,
  interruptionReason?: string
) {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;

  if (!taskId || !currentStageId) {
    return { error: (await getTranslations("errors.activity"))("missingData") };
  }

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const previousActiveLog = await tx.activityLog.findFirst({
        where: { userId, endedAt: null },
        select: { id: true, userId: true, taskId: true, stageId: true, startedAt: true },
      });

      if (previousActiveLog) {
        // Clicou "Iniciar" na tarefa em que já está: nada a fazer.
        if (previousActiveLog.taskId === taskId) {
          return { status: "already_active" as const };
        }

        const reason = interruptionReason?.trim();
        if (!reason) {
          return { status: "needs_reason" as const, previousTaskId: previousActiveLog.taskId };
        }

        // Fecha REGISTRANDO as horas. Antes daqui só carimbava `endedAt` e o
        // tempo da tarefa anterior era descartado em silêncio.
        await closeActivityLog(tx, previousActiveLog, new Date(), reason);
      }

      const newLog = await tx.activityLog.create({
        data: {
          userId,
          taskId,
          stageId: currentStageId,
          startedAt: new Date(),
          endedAt: null,
          // Marca o período como ABERTO para esta pessoa. É este campo, e não o
          // `endedAt`, que o banco usa para recusar um segundo cronômetro
          // simultâneo (índice único; nulos não colidem). Sai junto com o
          // `endedAt` em closeActivityLog.
          openForUserId: userId,
        },
      });

      return { status: "started" as const, log: newLog };
    });

    if (result.status === "needs_reason") {
      return { needsReason: true, previousTaskId: result.previousTaskId };
    }

    revalidatePath(`/tasks/${taskId}`);
    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath(`/reports/live-activity`);
    revalidatePath(`/dashboard`);

    return { success: true, ...result };
  } catch (error) {
    console.error("Error starting work on task:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to start work on task",
    };
  }
}

/**
 * Stop working on a task.
 * This is called when the user manually stops the task they are working on.
 * Automatically creates a TimeLog entry with the calculated hours worked.
 */
export async function stopWorkOnTask(activeLogId: string, taskId: string, description?: string) {
  const user = await requireMemberOrHigher();

  if (!activeLogId) {
    return { error: (await getTranslations("errors.activity"))("missingLogId") };
  }

  try {
    // Verify that this log belongs to the current user and get start time
    const log = await prisma.activityLog.findUnique({
      where: { id: activeLogId },
      select: {
        userId: true,
        startedAt: true,
        taskId: true,
        stageId: true,
      },
    });

    if (!log) {
      return { error: (await getTranslations("errors.activity"))("logNotFound") };
    }

    if (log.userId !== user.id) {
      return { error: (await getTranslations("errors.activity"))("notYours") };
    }

    // Mesmo caminho de fechamento da interrupção — é o que garante que os dois
    // fluxos registrem as horas do mesmo jeito. Descrição opcional aqui:
    // parar o próprio trabalho não exige justificar-se.
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await closeActivityLog(tx, { id: activeLogId, ...log }, new Date(), description);
    });

    // Revalidate paths
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath(`/reports/live-activity`);
    revalidatePath(`/dashboard`);

    return { success: true };
  } catch (error) {
    console.error("Error stopping work on task:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to stop work on task",
    };
  }
}

/**
 * Get all currently active work logs (for the live activity dashboard).
 * This is called from the dashboard every 10 seconds.
 */
export async function getActiveWorkLogs() {
  await requirePresenceRead();
  try {
    const activeLogs = await prisma.activityLog.findMany({
      where: { endedAt: null },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                id: true,
                name: true,
                client: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
        stage: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { startedAt: "desc" },
    });

    return activeLogs;
  } catch (error) {
    console.error("Error fetching active work logs:", error);
    throw error;
  }
}

/**
 * Get all online users (last seen today).
 * Includes both users actively working and users just browsing.
 * A user is considered online if they have a lastSeenAt timestamp from today (same calendar day).
 */
export async function getOnlineUsers() {
  await requirePresenceRead();

  try {
    // Get start of today (00:00:00)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Get ALL users who are online (lastSeenAt is today or later)
    const onlineUsers = await prisma.user.findMany({
      where: {
        lastSeenAt: {
          gte: startOfToday,
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        teams: {
          select: {
            name: true,
          },
        },
        lastSeenAt: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return onlineUsers;
  } catch (error) {
    console.error("Error fetching online users:", error);
    throw error;
  }
}

/**
 * Get all offline users (lastSeenAt is NULL or before today).
 * A user is considered offline if:
 * - They have never logged in (lastSeenAt is NULL), OR
 * - They explicitly logged out (lastSeenAt is NULL), OR
 * - Their last activity was before today (previous day or earlier)
 */
export async function getOfflineUsers() {
  await requirePresenceRead();

  try {
    // Get start of today (00:00:00)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Get users who are offline (lastSeenAt is null or before today)
    const offlineUsers = await prisma.user.findMany({
      where: {
        OR: [
          { lastSeenAt: null },
          {
            lastSeenAt: {
              lt: startOfToday,
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        teams: {
          select: {
            name: true,
          },
        },
        lastSeenAt: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return offlineUsers;
  } catch (error) {
    console.error("Error fetching offline users:", error);
    throw error;
  }
}

/**
 * Get the current user's active task (if any).
 * This is used to determine whether to show "Start" or "Stop" button.
 */
export async function getCurrentActiveLog(userId: string) {
  try {
    const activeLog = await prisma.activityLog.findFirst({
      where: {
        userId: userId,
        endedAt: null,
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
          },
        },
        stage: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return activeLog;
  } catch (error) {
    console.error("Error fetching current active log:", error);
    return null;
  }
}
