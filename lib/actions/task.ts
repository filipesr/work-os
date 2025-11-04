"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { auth } from "@/auth";
import { requireMemberOrHigher, getSessionUser } from "@/lib/permissions";

// Helper to get current user
async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: You must be logged in");
  }
  return session.user;
}

// Type definitions matching Prisma schema
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TaskStatus = "BACKLOG" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED";

// ========== Task Creation ==========

interface CreateTaskData {
  title: string;
  description: string;
  projectId: string;
  templateId: string;
  priority: TaskPriority;
  dueDate: string | null;
}

/**
 * Creates a new task from a workflow template.
 * This initializes the task at the first stage of the template.
 */
export async function createTask(formData: FormData) {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;

  // Extract form data
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const projectId = formData.get("projectId") as string;
  const templateId = formData.get("templateId") as string;
  const priority = formData.get("priority") as TaskPriority;
  const dueDateStr = formData.get("dueDate") as string;

  // Validation
  if (!title) {
    return { error: "Task title is required" };
  }

  if (!projectId) {
    return { error: "Project is required" };
  }

  if (!templateId) {
    return { error: "Workflow template is required" };
  }

  // Convert dueDate string to Date if provided
  const dueDate = dueDateStr ? new Date(dueDateStr) : null;

  try {
    // Execute task creation within a transaction
    const task = await prisma.$transaction(async (tx: any) => {
      // 1. Find the first stage of the selected template
      // The first stage is the one with the lowest order number
      const firstStage = await tx.templateStage.findFirst({
        where: { templateId },
        orderBy: { order: "asc" },
      });

      if (!firstStage) {
        throw new Error("Template is misconfigured; no stages found.");
      }

      // 2. Create the main Task record
      const newTask = await tx.task.create({
        data: {
          title,
          description: description || null,
          priority: priority || "MEDIUM",
          dueDate,
          status: "BACKLOG", // Initial status
          projectId,
          assigneeId: userId, // Creator is the initial assignee
          currentStageId: firstStage.id, // Set to the first stage
        },
      });

      // 3. Create the first log entry in the task's history
      await tx.taskStageLog.create({
        data: {
          taskId: newTask.id,
          stageId: firstStage.id,
          enteredAt: new Date(),
          exitedAt: null, // Still in this stage
          userId: userId, // The user who created the task
        },
      });

      return newTask;
    });

    // Revalidate relevant paths
    revalidatePath(`/admin/tasks`);
    revalidatePath(`/projects/${projectId}`);

    // Redirect to the task detail page or project page
    redirect(`/admin/tasks/${task.id}`);
  } catch (error) {
    console.error("Error creating task:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to create task"
    };
  }
}

// ========== Helper Functions ==========

/**
 * Get all projects for selection
 */
export async function getProjectsForSelect() {
  const user = await getCurrentUser();

  // If user is ADMIN, show all projects
  // Otherwise, show only projects where user is a member
  const userRole = (user as any).role;

  if (userRole === "ADMIN") {
    return prisma.project.findMany({
      select: {
        id: true,
        name: true,
        clientId: true,
        client: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  // For non-admins, show projects they have access to
  return prisma.project.findMany({
    where: {
      OR: [
        { createdById: user.id as string },
        // Add team-based filtering here when needed
      ],
    },
    select: {
      id: true,
      name: true,
      clientId: true,
      client: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Get all workflow templates for selection
 */
export async function getTemplatesForSelect() {
  await getCurrentUser(); // Ensure user is authenticated

  return prisma.workflowTemplate.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      _count: {
        select: { stages: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * Get task details by ID
 */
export async function getTaskById(taskId: string) {
  await getCurrentUser();

  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        include: {
          client: true,
        },
      },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      currentStage: {
        include: {
          template: true,
          defaultTeam: true,
        },
      },
      stageLogs: {
        include: {
          stage: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { enteredAt: "desc" },
      },
      comments: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

/**
 * Get all tasks (with optional filtering)
 */
export async function getTasks() {
  await getCurrentUser();

  return prisma.task.findMany({
    include: {
      project: {
        include: {
          client: true,
        },
      },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      currentStage: {
        include: {
          template: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

// ========== State Machine: Stage Transitions ==========

/**
 * Get available next stages for a task (where dependencies are met).
 * This helps the UI show which stages the task can advance to.
 */
export async function getAvailableNextStages(taskId: string) {
  await getCurrentUser();

  try {
    // Get the task with its current stage and template
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        currentStage: {
          include: {
            template: {
              include: {
                stages: {
                  orderBy: { order: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (!task || !task.currentStage) {
      return [];
    }

    const allTemplateStages = task.currentStage.template.stages;

    // Get all stages in the template that are after the current stage
    const potentialNextStages = allTemplateStages.filter(
      (stage: any) => stage.order > task.currentStage!.order
    );

    // For each potential stage, check if dependencies are met
    const availableStages: any[] = [];

    for (const stage of potentialNextStages) {
      // Get dependencies for this stage
      const dependencies = await prisma.stageDependency.findMany({
        where: { stageId: stage.id },
        select: { dependsOnStageId: true },
      });

      // If no dependencies, it's available
      if (dependencies.length === 0) {
        availableStages.push(stage);
        continue;
      }

      // Check if all dependencies have been completed for this task
      const dependsOnStageIds = dependencies.map((d: any) => d.dependsOnStageId);
      const completedStageLogs = await prisma.taskStageLog.findMany({
        where: {
          taskId: taskId,
          stageId: { in: dependsOnStageIds },
          exitedAt: { not: null },
        },
        select: { stageId: true },
      });

      const completedStageIds = completedStageLogs.map((log: any) => log.stageId);
      const allDependenciesMet = dependsOnStageIds.every((depId: any) =>
        completedStageIds.includes(depId)
      );

      if (allDependenciesMet) {
        availableStages.push(stage);
      }
    }

    return availableStages;
  } catch (error) {
    console.error("Error getting available next stages:", error);
    return [];
  }
}

/**
 * Get all previous stages for a task (for reversion).
 * Returns stages that this task has already been through.
 */
export async function getPreviousStages(taskId: string) {
  await getCurrentUser();

  try {
    // Get all unique stages this task has been through
    const stageLogs = await prisma.taskStageLog.findMany({
      where: {
        taskId: taskId,
        exitedAt: { not: null }, // Only completed stages
      },
      include: {
        stage: true,
      },
      orderBy: { exitedAt: "desc" },
    });

    // Get unique stages (in case task went through same stage multiple times)
    const uniqueStages = Array.from(
      new Map(stageLogs.map((log: any) => [log.stage.id, log.stage])).values()
    );

    return uniqueStages as any[];
  } catch (error) {
    console.error("Error getting previous stages:", error);
    return [];
  }
}


/**
 * Advances a task to the next stage (forward movement).
 * Validates that all dependencies are met before allowing the transition.
 * This is the core of the workflow engine.
 */
export async function advanceTaskStage(
  taskId: string,
  nextStageId: string
) {
  const user = await requireMemberOrHigher();
  const currentUserId = user.id as string;

  try {
    // 1. Get all dependencies for the target stage
    const dependencies = await prisma.stageDependency.findMany({
      where: { stageId: nextStageId },
      select: { dependsOnStageId: true },
    });

    // 2. Check if all dependencies are met
    if (dependencies.length > 0) {
      const dependsOnStageIds = dependencies.map((d: any) => d.dependsOnStageId);

      // Find all stage logs for this task where the dependency stages have been completed
      const completedStageLogs = await prisma.taskStageLog.findMany({
        where: {
          taskId: taskId,
          stageId: { in: dependsOnStageIds },
          exitedAt: { not: null }, // exitedAt being set means the stage is complete
        },
        select: { stageId: true },
      });

      // Check if all required dependency stages have been completed
      const completedStageIds = completedStageLogs.map((log: any) => log.stageId);
      const allDependenciesMet = dependsOnStageIds.every((depId: any) =>
        completedStageIds.includes(depId)
      );

      if (!allDependenciesMet) {
        return {
          error:
            "Cannot advance: Not all dependency stages have been completed yet.",
        };
      }
    }

    // 3. Run the atomic transition within a transaction
    await prisma.$transaction(async (tx: any) => {
      // Get the current task
      const task = await tx.task.findUnique({
        where: { id: taskId },
        select: { id: true, currentStageId: true },
      });

      if (!task || !task.currentStageId) {
        throw new Error("Task not found or has no current stage.");
      }

      // 4. Find and "close" the current stage log
      const currentLog = await tx.taskStageLog.findFirst({
        where: {
          taskId: taskId,
          stageId: task.currentStageId,
          exitedAt: null,
        },
        orderBy: { enteredAt: "desc" },
      });

      if (currentLog) {
        await tx.taskStageLog.update({
          where: { id: currentLog.id },
          data: {
            exitedAt: new Date(),
            status: "COMPLETED", // Mark as completed (not reverted)
          },
        });
      }

      // 5. Create the new stage log
      await tx.taskStageLog.create({
        data: {
          taskId: taskId,
          stageId: nextStageId,
          enteredAt: new Date(),
          exitedAt: null,
          userId: currentUserId,
        },
      });

      // 6. Check if this is the last stage in the workflow template
      const nextStage = await tx.templateStage.findUnique({
        where: { id: nextStageId },
        include: {
          template: {
            include: {
              stages: {
                orderBy: { order: "desc" },
                take: 1,
              },
            },
          },
        },
      });

      const isLastStage =
        nextStage &&
        nextStage.template.stages[0] &&
        nextStage.id === nextStage.template.stages[0].id;

      // 7. Update the task's current stage pointer
      await tx.task.update({
        where: { id: taskId },
        data: {
          currentStageId: nextStageId,
          status: isLastStage ? "COMPLETED" : "IN_PROGRESS",
          completedAt: isLastStage ? new Date() : null, // Set completedAt if final stage
        },
      });
    });

    // Get task to find projectId for revalidation
    const updatedTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });

    // Revalidate paths
    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath(`/admin/tasks`);
    revalidatePath(`/tasks/${taskId}`);
    if (updatedTask) {
      revalidatePath(`/projects/${updatedTask.projectId}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Error advancing task stage:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to advance task",
    };
  }
}

/**
 * Reverts a task to a previous stage (backward movement / rejection loop).
 * This does NOT check dependencies - it's for when QC/Review rejects work.
 */
export async function revertTaskStage(
  taskId: string,
  revertToStageId: string,
  comment: string
) {
  const user = await requireMemberOrHigher();
  const currentUserId = user.id as string;

  if (!comment || comment.trim().length === 0) {
    return { error: "A comment explaining the reversion is required." };
  }

  try {
    await prisma.$transaction(async (tx: any) => {
      // Get the current task
      const task = await tx.task.findUnique({
        where: { id: taskId },
        select: { id: true, currentStageId: true },
      });

      if (!task || !task.currentStageId) {
        throw new Error("Task not found or has no current stage.");
      }

      // 1. Find and "close" the current log (mark as REVERTED)
      const currentLog = await tx.taskStageLog.findFirst({
        where: {
          taskId: taskId,
          stageId: task.currentStageId,
          exitedAt: null,
        },
        orderBy: { enteredAt: "desc" },
      });

      if (currentLog) {
        await tx.taskStageLog.update({
          where: { id: currentLog.id },
          data: {
            exitedAt: new Date(),
            status: "REVERTED", // Mark as reverted (rejected)
          },
        });
      }

      // 2. Create the new log for the reverted stage
      await tx.taskStageLog.create({
        data: {
          taskId: taskId,
          stageId: revertToStageId,
          enteredAt: new Date(),
          exitedAt: null,
          userId: currentUserId,
        },
      });

      // 3. Update the task's current stage pointer
      // Also clear completedAt if task was completed and is being reverted
      await tx.task.update({
        where: { id: taskId },
        data: {
          currentStageId: revertToStageId,
          status: "IN_PROGRESS",
          completedAt: null, // Clear completion date on revert
        },
      });

      // 4. Add the rejection comment
      await tx.taskComment.create({
        data: {
          content: `**REVERTED TO PREVIOUS STAGE:** ${comment}`,
          taskId: taskId,
          userId: currentUserId,
        },
      });
    });

    // Get task to find projectId for revalidation
    const updatedTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });

    // Revalidate paths
    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath(`/admin/tasks`);
    revalidatePath(`/tasks/${taskId}`);
    if (updatedTask) {
      revalidatePath(`/projects/${updatedTask.projectId}`);
    }

    return { success: true };
  } catch (error) {
    console.error("Error reverting task stage:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to revert task",
    };
  }
}

// ========== Collaboration Actions (Comments & Artifacts) ==========

/**
 * Add a comment to a task
 */
export async function addComment(taskId: string, content: string) {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;

  if (!content || content.trim().length === 0) {
    return { error: "Comment content is required" };
  }

  try {
    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        userId,
        content: content.trim(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Revalidate the task detail pages
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath(`/admin/tasks/${taskId}`);

    return { success: true, comment };
  } catch (error) {
    console.error("Error adding comment:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to add comment",
    };
  }
}

/**
 * Add a link artifact to a task (Google Drive, Figma, etc.)
 */
export async function addLinkArtifact(
  taskId: string,
  title: string,
  url: string,
  type: "DOCUMENT" | "IMAGE" | "VIDEO" | "FIGMA" | "OTHER"
) {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;

  if (!title || title.trim().length === 0) {
    return { error: "Artifact title is required" };
  }

  if (!url || url.trim().length === 0) {
    return { error: "Artifact URL is required" };
  }

  try {
    const artifact = await prisma.taskArtifact.create({
      data: {
        taskId,
        userId,
        title: title.trim(),
        url: url.trim(),
        type,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    // Revalidate the task detail pages
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath(`/admin/tasks/${taskId}`);

    return { success: true, artifact };
  } catch (error) {
    console.error("Error adding artifact:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to add artifact",
    };
  }
}

/**
 * Add a file artifact to a task (from Cloudinary upload).
 * This is called AFTER the client has already uploaded the file to Cloudinary.
 */
export async function addFileArtifact(
  taskId: string,
  title: string,
  url: string,
  type: "DOCUMENT" | "IMAGE" | "VIDEO" | "FIGMA" | "OTHER"
) {
  // This function is identical to addLinkArtifact
  // The difference is semantic: it's called after a Cloudinary upload
  return addLinkArtifact(taskId, title, url, type);
}

// ========== Time Logging (for BI/Reporting) ==========

/**
 * Log time spent on a task.
 * This creates a TimeLog entry for productivity reporting.
 */
export async function logTime(
  taskId: string,
  hoursSpent: number,
  logDate: Date,
  description?: string
) {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;

  // Validation
  if (!taskId) {
    return { error: "Task ID is required" };
  }

  if (!hoursSpent || hoursSpent <= 0) {
    return { error: "Hours spent must be greater than 0" };
  }

  if (!logDate) {
    return { error: "Log date is required" };
  }

  try {
    // Get the task to find its current stage
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        currentStageId: true,
        projectId: true,
      },
    });

    if (!task) {
      return { error: "Task not found" };
    }

    // Create the time log entry
    const timeLog = await prisma.timeLog.create({
      data: {
        taskId,
        userId,
        hoursSpent,
        logDate,
        description: description || null,
        stageId: task.currentStageId, // Associate with current stage
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
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

    // Revalidate relevant pages
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath(`/reports/productivity`);

    return { success: true, timeLog };
  } catch (error) {
    console.error("Error logging time:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to log time",
    };
  }
}
