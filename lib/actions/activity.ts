"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { requireMemberOrHigher, requireManagerOrAdmin } from "@/lib/permissions";

// Helper to get current user
async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: You must be logged in");
  }
  return session.user;
}

/**
 * Start working on a task.
 * This action is "intelligent" - it automatically stops any other task the user is currently working on.
 */
export async function startWorkOnTask(
  taskId: string,
  currentStageId: string
) {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;

  if (!taskId || !currentStageId) {
    return { error: "Missing required data (taskId or stageId)" };
  }

  try {
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Find and stop any *previous* active log for this user
      const previousActiveLog = await tx.activityLog.findFirst({
        where: {
          userId: userId,
          endedAt: null,
        },
      });

      if (previousActiveLog) {
        // If the user clicked "Start" on the *same task* they are already working on, do nothing
        if (previousActiveLog.taskId === taskId) {
          return { status: "already_active" };
        }

        // Stop the previous log
        await tx.activityLog.update({
          where: { id: previousActiveLog.id },
          data: { endedAt: new Date() },
        });
      }

      // 2. Create the new active log
      const newLog = await tx.activityLog.create({
        data: {
          userId: userId,
          taskId: taskId,
          stageId: currentStageId,
          startedAt: new Date(),
          endedAt: null,
        },
      });

      return { status: "started", log: newLog };
    });

    // Revalidate paths
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath(`/reports/live-activity`);

    return { success: true, ...result };
  } catch (error) {
    console.error("Error starting work on task:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to start work on task",
    };
  }
}

/**
 * Stop working on a task.
 * This is called when the user manually stops the task they are working on.
 */
export async function stopWorkOnTask(activeLogId: string, taskId: string) {
  const user = await requireMemberOrHigher();

  if (!activeLogId) {
    return { error: "Missing active log ID" };
  }

  try {
    // Verify that this log belongs to the current user (security check)
    const log = await prisma.activityLog.findUnique({
      where: { id: activeLogId },
      select: { userId: true },
    });

    if (!log) {
      return { error: "Activity log not found" };
    }

    if (log.userId !== user.id) {
      return { error: "Unauthorized: This activity log does not belong to you" };
    }

    // Stop the activity log
    await prisma.activityLog.update({
      where: { id: activeLogId },
      data: { endedAt: new Date() },
    });

    // Revalidate paths
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath(`/reports/live-activity`);

    return { success: true };
  } catch (error) {
    console.error("Error stopping work on task:", error);
    return {
      error:
        error instanceof Error ? error.message : "Failed to stop work on task",
    };
  }
}

/**
 * Get all currently active work logs (for the live activity dashboard).
 * This is called from the dashboard every 10 seconds.
 */
export async function getActiveWorkLogs() {
  await requireManagerOrAdmin();
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
