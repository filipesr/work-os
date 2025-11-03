"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { auth } from "@/auth";

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
  const user = await getCurrentUser();
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
