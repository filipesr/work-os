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
    throw new Error("Task title is required");
  }

  if (!projectId) {
    throw new Error("Project is required");
  }

  if (!templateId) {
    throw new Error("Workflow template is required");
  }

  // Convert dueDate string to Date if provided
  const dueDate = dueDateStr ? new Date(dueDateStr) : null;

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
        assigneeId: null, // Not assigned initially
      },
    });

    // 3. Create the first active stage (fork/join system)
    await tx.taskActiveStage.create({
      data: {
        taskId: newTask.id,
        stageId: firstStage.id,
        status: "ACTIVE",
        assigneeId: null, // Not assigned - goes to team backlog
      },
    });

    // 4. Create the first log entry in the task's history
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
  revalidatePath(`/dashboard`); // ✅ Adiciona revalidação do dashboard
  revalidatePath(`/projects/${projectId}`);

  // Redirect to the task detail page or project page
  redirect(`/admin/tasks/${task.id}`);
}

// ========== Helper Functions ==========

/**
 * Get all projects for selection
 */
export async function getProjectsForSelect(): Promise<Array<{
  id: string;
  name: string;
  clientId: string;
  client: { name: string };
}>> {
  await getCurrentUser();

  // Return all projects - access control can be added later if needed
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

  const task = await prisma.task.findUnique({
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
      activeStages: {
        where: {
          status: { in: ["ACTIVE", "BLOCKED"] },
        },
        include: {
          stage: {
            include: {
              template: true,
              defaultTeam: true,
            },
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          stage: { order: "asc" },
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

  if (!task) return null;

  // Add computed properties for backward compatibility
  const currentActiveStage = task.activeStages.find(as => as.status === "ACTIVE");

  return {
    ...task,
    currentStage: currentActiveStage ? currentActiveStage.stage : null,
    currentStageId: currentActiveStage ? currentActiveStage.stageId : null,
    // Override assignee with the assignee from the active stage
    assignee: currentActiveStage?.assignee || task.assignee,
  };
}

/**
 * Get all tasks (with optional filtering)
 */
export async function getTasks() {
  await getCurrentUser();

  const tasks = await prisma.task.findMany({
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
      activeStages: {
        where: {
          status: { in: ["ACTIVE", "BLOCKED"] },
        },
        include: {
          stage: {
            include: {
              template: true,
              defaultTeam: true,
            },
          },
          assignee: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          stage: { order: "asc" },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Add computed properties for backward compatibility
  return tasks.map((task) => {
    const currentActiveStage = task.activeStages.find(as => as.status === "ACTIVE");
    return {
      ...task,
      currentStage: currentActiveStage ? currentActiveStage.stage : null,
      currentStageId: currentActiveStage ? currentActiveStage.stageId : null,
      // Override assignee with the assignee from the active stage
      assignee: currentActiveStage?.assignee || task.assignee,
    };
  });
}

// ========== State Machine: Stage Transitions ==========

/**
 * DEPRECATED: Get available next stages for a task.
 *
 * This function is no longer used in the fork/join system, as next stages
 * are automatically determined by completeStageAndAdvance().
 *
 * Kept for backward compatibility with older UI components.
 */
export async function getAvailableNextStages(taskId: string) {
  await getCurrentUser();

  // Return empty array - fork/join system automatically determines next stages
  return [];
}

/**
 * Unassign a task (remove assignee) - Only for admin, manager, or task creator
 */
export async function unassignTask(taskId: string) {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id as string;

  try {
    // Get task with assignee info
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: true,
        project: {
          include: {
            client: true,
          },
        },
      },
    });

    if (!task) {
      return { error: "Tarefa não encontrada" };
    }

    // Check permissions: must be admin, manager, or the assignee themselves
    const userWithRole = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });

    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = task.assigneeId === currentUserId;

    if (!isAdmin && !isManager && !isAssignee) {
      return { error: "Apenas administradores, gerentes ou o responsável atual podem desatribuir tarefas" };
    }

    // Unassign task and return it to backlog
    await prisma.task.update({
      where: { id: taskId },
      data: {
        assigneeId: null,
        status: "BACKLOG", // Return task to backlog when unassigned
      },
    });

    // Add comment about unassignment
    const userName = currentUser.name || currentUser.email;
    const previousAssignee = task.assignee?.name || task.assignee?.email || "Não atribuído";

    await prisma.taskComment.create({
      data: {
        taskId: taskId,
        userId: currentUserId,
        content: `**TAREFA DESATRIBUÍDA** por ${userName}\nAnterior: ${previousAssignee}\nData: ${new Date().toLocaleString('pt-BR')}`,
      },
    });

    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath("/admin/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/tasks/${taskId}`);
    return { success: true };
  } catch (error) {
    console.error("Error unassigning task:", error);
    return { error: "Erro ao desatribuir tarefa" };
  }
}

/**
 * Complete a task - Mark task as COMPLETED
 * Can be used by task assignee, admin, or manager
 */
export async function completeTask(taskId: string) {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id as string;

  try {
    // Get task with assignee info
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: true,
      },
    });

    if (!task) {
      return { error: "Tarefa não encontrada" };
    }

    // Check permissions: must be admin, manager, or the assignee
    const userWithRole = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });

    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = task.assigneeId === currentUserId;

    if (!isAdmin && !isManager && !isAssignee) {
      return { error: "Apenas administradores, gerentes ou o responsável atual podem concluir tarefas" };
    }

    // Check if task is already completed
    if (task.status === "COMPLETED") {
      return { error: "Esta tarefa já está concluída" };
    }

    // Mark task as completed
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Add comment about completion
    const userName = currentUser.name || currentUser.email;
    await prisma.taskComment.create({
      data: {
        taskId: taskId,
        userId: currentUserId,
        content: `**TAREFA CONCLUÍDA** por ${userName}\nData: ${new Date().toLocaleString('pt-BR')}`,
      },
    });

    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath("/admin/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/tasks/${taskId}`);
    return { success: true };
  } catch (error) {
    console.error("Error completing task:", error);
    return { error: "Erro ao concluir tarefa" };
  }
}

/**
 * Activate next stages after completing current stage (Fork/Join logic)
 * This implements parallel workflow: when a stage completes, it can activate multiple next stages
 */
export async function activateNextStages(taskId: string, completedStageId: string) {
  try {
    // 1. Mark current active stage as COMPLETED
    await prisma.taskActiveStage.updateMany({
      where: {
        taskId,
        stageId: completedStageId,
        status: "ACTIVE",
      },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // 2. Find all stages that depend on this completed stage
    const dependentStages = await prisma.stageDependency.findMany({
      where: {
        dependsOnStageId: completedStageId,
      },
      include: {
        stage: {
          include: {
            dependencies: {
              include: {
                dependsOn: true,
              },
            },
            defaultTeam: true,
          },
        },
      },
    });

    const activated: any[] = [];
    const blocked: any[] = [];

    // 3. For each dependent stage, check if ALL its dependencies are complete
    for (const dep of dependentStages) {
      const stage = dep.stage;

      // Check if this stage is already active or completed
      const existing = await prisma.taskActiveStage.findUnique({
        where: {
          taskId_stageId: {
            taskId,
            stageId: stage.id,
          },
        },
      });

      if (existing) {
        // Stage already exists - check if it was blocked and can now be unblocked
        if (existing.status === "BLOCKED") {
          // Check all dependencies
          const allDepsComplete = await checkAllDependenciesComplete(taskId, stage.id);
          if (allDepsComplete) {
            // Unblock it
            await prisma.taskActiveStage.update({
              where: { id: existing.id },
              data: { status: "ACTIVE" },
            });
            activated.push(stage);
          }
        }
        continue;
      }

      // Check if ALL dependencies are complete
      const allDepsComplete = await checkAllDependenciesComplete(taskId, stage.id);

      if (allDepsComplete) {
        // Create as ACTIVE
        await prisma.taskActiveStage.create({
          data: {
            taskId,
            stageId: stage.id,
            status: "ACTIVE",
          },
        });
        activated.push(stage);
      } else {
        // Create as BLOCKED
        await prisma.taskActiveStage.create({
          data: {
            taskId,
            stageId: stage.id,
            status: "BLOCKED",
          },
        });
        blocked.push(stage);
      }
    }

    return { activated, blocked };
  } catch (error) {
    console.error("Error activating next stages:", error);
    throw error;
  }
}

/**
 * Helper: Check if all dependencies of a stage are completed
 */
async function checkAllDependenciesComplete(taskId: string, stageId: string): Promise<boolean> {
  const dependencies = await prisma.stageDependency.findMany({
    where: { stageId },
    include: { dependsOn: true },
  });

  if (dependencies.length === 0) {
    return true; // No dependencies = can activate
  }

  // Check if all dependency stages have been completed
  for (const dep of dependencies) {
    const completedStage = await prisma.taskActiveStage.findFirst({
      where: {
        taskId,
        stageId: dep.dependsOnStageId,
        status: "COMPLETED",
      },
    });

    if (!completedStage) {
      return false; // At least one dependency not complete
    }
  }

  return true; // All dependencies complete
}

/**
 * Complete current stage and activate next stages (replaces advanceTaskStage)
 */
export async function completeStageAndAdvance(taskId: string, stageId: string) {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id as string;

  try {
    // 1. Get current active stage
    const activeStage = await prisma.taskActiveStage.findUnique({
      where: {
        taskId_stageId: {
          taskId,
          stageId,
        },
      },
      include: {
        stage: {
          include: {
            template: true,
            defaultTeam: true,
          },
        },
        task: {
          include: {
            project: {
              include: {
                client: true,
              },
            },
          },
        },
      },
    });

    if (!activeStage) {
      return { error: "Etapa ativa não encontrada" };
    }

    if (activeStage.status !== "ACTIVE") {
      return { error: "Esta etapa não está ativa" };
    }

    // 2. Check permissions
    const userWithRole = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true, teamId: true },
    });

    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = activeStage.assigneeId === currentUserId;

    if (!isAdmin && !isManager && !isAssignee) {
      return { error: "Você não tem permissão para completar esta etapa" };
    }

    // 3. Validate contribution (if not admin/manager)
    if (!isAdmin && !isManager) {
      const contributions = await prisma.$transaction([
        prisma.taskArtifact.count({
          where: { taskId, userId: currentUserId },
        }),
        prisma.taskComment.count({
          where: { taskId, userId: currentUserId },
        }),
      ]);

      const [artifactCount, commentCount] = contributions;
      if (artifactCount === 0 && commentCount === 0) {
        return {
          error: "Você precisa adicionar pelo menos 1 artefato ou comentário antes de completar esta etapa.",
        };
      }
    }

    // 4. Close current stage log
    const currentLog = await prisma.taskStageLog.findFirst({
      where: {
        taskId,
        stageId,
        exitedAt: null,
      },
    });

    if (currentLog) {
      await prisma.taskStageLog.update({
        where: { id: currentLog.id },
        data: {
          exitedAt: new Date(),
          status: "COMPLETED",
        },
      });
    }

    // 5. Activate next stages (fork/join logic)
    const { activated, blocked } = await activateNextStages(taskId, stageId);

    // 6. Add comment if admin/manager moved without being assignee
    if ((isAdmin || isManager) && !isAssignee) {
      const userName = currentUser.name || currentUser.email;
      const userRole = userWithRole?.role;
      await prisma.taskComment.create({
        data: {
          taskId,
          userId: currentUserId,
          content: `**ETAPA CONCLUÍDA POR ${userRole}** ${userName}\nEtapa: ${activeStage.stage.name}\nData: ${new Date().toLocaleString('pt-BR')}\n\n⚠️ Esta etapa foi concluída manualmente por um ${userRole === 'ADMIN' ? 'administrador' : 'gerente'}.`,
        },
      });
    }

    // 7. Update task status if needed
    const remainingActive = await prisma.taskActiveStage.count({
      where: {
        taskId,
        status: "ACTIVE",
      },
    });

    if (remainingActive > 0) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "IN_PROGRESS" },
      });
    }

    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath("/admin/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/tasks/${taskId}`);

    return {
      success: true,
      completed: activeStage.stage,
      activated,
      blocked,
    };
  } catch (error) {
    console.error("Error completing stage:", error);
    return { error: "Erro ao completar etapa" };
  }
}

/**
 * Get blocked dependencies for a stage (shows what's preventing activation)
 */
export async function getBlockedDependencies(taskId: string, stageId: string) {
  try {
    const dependencies = await prisma.stageDependency.findMany({
      where: { stageId },
      include: {
        dependsOn: true,
      },
    });

    const waitingFor = [];

    for (const dep of dependencies) {
      const activeStage = await prisma.taskActiveStage.findFirst({
        where: {
          taskId,
          stageId: dep.dependsOnStageId,
        },
      });

      waitingFor.push({
        stage: dep.dependsOn,
        status: activeStage?.status || "NOT_STARTED",
        isComplete: activeStage?.status === "COMPLETED",
      });
    }

    return { waitingFor };
  } catch (error) {
    console.error("Error getting blocked dependencies:", error);
    return { waitingFor: [] };
  }
}

/**
 * Get active stages assigned to current user
 */
export async function getMyActiveStages() {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id as string;

  return await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: currentUserId,
      status: "ACTIVE",
    },
    include: {
      task: {
        include: {
          project: {
            include: {
              client: true,
            },
          },
        },
      },
      stage: {
        include: {
          template: true,
          defaultTeam: true,
        },
      },
    },
    orderBy: {
      task: {
        dueDate: "asc",
      },
    },
  });
}

/**
 * Get team backlog (active stages not assigned)
 */
export async function getTeamBacklog(teamId: string) {
  return await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: null,
      status: "ACTIVE",
      stage: {
        defaultTeamId: teamId,
      },
    },
    include: {
      task: {
        include: {
          project: {
            include: {
              client: true,
            },
          },
        },
      },
      stage: {
        include: {
          template: true,
          defaultTeam: true,
        },
      },
    },
    orderBy: {
      task: {
        createdAt: "asc",
      },
    },
  });
}

/**
 * Get blocked stages visible to team
 */
export async function getTeamBlockedStages(teamId: string) {
  return await prisma.taskActiveStage.findMany({
    where: {
      status: "BLOCKED",
      stage: {
        defaultTeamId: teamId,
      },
    },
    include: {
      task: {
        include: {
          project: {
            include: {
              client: true,
            },
          },
        },
      },
      stage: {
        include: {
          template: true,
          defaultTeam: true,
        },
      },
    },
  });
}

/**
 * Claim an active stage (assign to current user)
 */
export async function claimActiveStage(taskId: string, stageId: string) {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id as string;

  try {
    const activeStage = await prisma.taskActiveStage.findUnique({
      where: {
        taskId_stageId: {
          taskId,
          stageId,
        },
      },
      include: {
        stage: true,
      },
    });

    if (!activeStage) {
      return { error: "Etapa ativa não encontrada" };
    }

    if (activeStage.status !== "ACTIVE") {
      return { error: "Esta etapa não está disponível para reivindicação" };
    }

    if (activeStage.assigneeId) {
      return { error: "Esta etapa já está atribuída" };
    }

    await prisma.taskActiveStage.update({
      where: { id: activeStage.id },
      data: { assigneeId: currentUserId },
    });

    // Update Task status to IN_PROGRESS
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS" },
    });

    // Add comment
    const userName = currentUser.name || currentUser.email;
    await prisma.taskComment.create({
      data: {
        taskId,
        userId: currentUserId,
        content: `**ETAPA REIVINDICADA** por ${userName}\nEtapa: ${activeStage.stage.name}\nData: ${new Date().toLocaleString('pt-BR')}`,
      },
    });

    // Create stage log
    await prisma.taskStageLog.create({
      data: {
        taskId,
        stageId,
        userId: currentUserId,
        enteredAt: new Date(),
      },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/tasks/${taskId}`);

    return { success: true };
  } catch (error) {
    console.error("Error claiming active stage:", error);
    return { error: "Erro ao reivindicar etapa" };
  }
}

/**
 * Unassign an active stage
 */
export async function unassignActiveStage(taskId: string, stageId: string) {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id as string;

  try {
    const activeStage = await prisma.taskActiveStage.findUnique({
      where: {
        taskId_stageId: {
          taskId,
          stageId,
        },
      },
      include: {
        stage: true,
        assignee: true,
      },
    });

    if (!activeStage) {
      return { error: "Etapa ativa não encontrada" };
    }

    // Check permissions
    const userWithRole = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true },
    });

    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = activeStage.assigneeId === currentUserId;

    if (!isAdmin && !isManager && !isAssignee) {
      return { error: "Apenas administradores, gerentes ou o responsável atual podem desatribuir etapas" };
    }

    await prisma.taskActiveStage.update({
      where: { id: activeStage.id },
      data: { assigneeId: null },
    });

    // Update Task status if no more active assigned stages
    const remainingAssigned = await prisma.taskActiveStage.count({
      where: {
        taskId,
        assigneeId: { not: null },
        status: "ACTIVE",
      },
    });

    if (remainingAssigned === 0) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "BACKLOG" },
      });
    }

    // Add comment
    const userName = currentUser.name || currentUser.email;
    const previousAssignee = activeStage.assignee?.name || activeStage.assignee?.email || "Não atribuído";

    await prisma.taskComment.create({
      data: {
        taskId,
        userId: currentUserId,
        content: `**ETAPA DESATRIBUÍDA** por ${userName}\nEtapa: ${activeStage.stage.name}\nAnterior: ${previousAssignee}\nData: ${new Date().toLocaleString('pt-BR')}`,
      },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/tasks/${taskId}`);

    return { success: true };
  } catch (error) {
    console.error("Error unassigning active stage:", error);
    return { error: "Erro ao desatribuir etapa" };
  }
}

/**
 * DEPRECATED: Get diagnostic information about why stages are not available.
 *
 * This function is no longer used in the fork/join system.
 * Kept for backward compatibility.
 */
export async function getStageAvailabilityDiagnostic(taskId: string) {
  await getCurrentUser();

  // Return default values for fork/join system
  return {
    hasContribution: true,
    isLastStage: false,
    blockedStages: [],
    reasons: [],
  };
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
    // Check if user is admin or manager
    const userRole = (user as any).role as string;
    const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

    // 1. ✅ TEAM VALIDATION: Get user's team and verify next stage belongs to same team
    const userWithTeam = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { teamId: true, team: { select: { name: true } } },
    });

    // Admin/Manager can bypass team requirement
    if (!isAdminOrManager && !userWithTeam?.teamId) {
      return {
        error: "Você não está atribuído a nenhum time. Contate o administrador.",
      };
    }

    const nextStage = await prisma.templateStage.findUnique({
      where: { id: nextStageId },
      select: {
        id: true,
        name: true,
        defaultTeamId: true,
        defaultTeam: { select: { name: true } },
      },
    });

    if (!nextStage) {
      return { error: "Etapa de destino não encontrada." };
    }

    // ✅ Admin/Manager can bypass team validation
    if (!isAdminOrManager && userWithTeam?.teamId && nextStage.defaultTeamId !== userWithTeam.teamId) {
      return {
        error: `Você não pode avançar para a etapa "${nextStage.name}" porque ela pertence ao time "${nextStage.defaultTeam?.name}". Você faz parte do time "${userWithTeam.team?.name}".`,
      };
    }

    // DEPRECATED: This function is no longer used in the fork/join system
    return { error: "Esta função foi depreciada. Use completeStageAndAdvance() em vez disso." };
  } catch (error) {
    console.error("Error advancing task stage:", error);
    return { error: "Erro ao avançar tarefa" };
  }
}

/**
 * Reverts a task to a previous stage (backward movement / rejection loop).
 * This does NOT check dependencies - it's for when QC/Review rejects work.
 *
 * In the fork/join system, this:
 * 1. Marks all current active stages as COMPLETED
 * 2. Creates a new ACTIVE stage for the reverted-to stage
 * 3. Logs the reversion with a comment
 */
export async function revertTaskStage(
  taskId: string,
  revertToStageId: string,
  comment: string
) {
  const user = await requireMemberOrHigher();
  const currentUserId = user.id as string;
  const userRole = (user as any).role as string;

  if (!comment || comment.trim().length === 0) {
    return { error: "Um comentário explicando a reversão é obrigatório." };
  }

  try {
    // 1. Get the target stage to revert to
    const targetStage = await prisma.templateStage.findUnique({
      where: { id: revertToStageId },
      include: {
        template: true,
        defaultTeam: true,
      },
    });

    if (!targetStage) {
      return { error: "Etapa de destino não encontrada" };
    }

    // 2. Get all current active stages
    const currentActiveStages = await prisma.taskActiveStage.findMany({
      where: {
        taskId,
        status: { in: ["ACTIVE", "BLOCKED"] },
      },
      include: {
        stage: true,
      },
    });

    if (currentActiveStages.length === 0) {
      return { error: "Não há etapas ativas para reverter" };
    }

    // 3. Check permissions - must be admin, manager, or assignee of at least one active stage
    const userWithRole = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { role: true, name: true },
    });

    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = currentActiveStages.some(as => as.assigneeId === currentUserId);

    if (!isAdmin && !isManager && !isAssignee) {
      return { error: "Você não tem permissão para reverter esta tarefa" };
    }

    // 4. Execute reversion in a transaction
    await prisma.$transaction(async (tx: any) => {
      // 4a. Mark all current active/blocked stages as COMPLETED
      for (const activeStage of currentActiveStages) {
        await tx.taskActiveStage.update({
          where: { id: activeStage.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });

        // Close the stage log
        const openLog = await tx.taskStageLog.findFirst({
          where: {
            taskId,
            stageId: activeStage.stageId,
            exitedAt: null,
          },
        });

        if (openLog) {
          await tx.taskStageLog.update({
            where: { id: openLog.id },
            data: {
              exitedAt: new Date(),
              status: "REVERTED",
            },
          });
        }
      }

      // 4b. Check if target stage already has an active entry (shouldn't happen, but check)
      const existingTargetStage = await tx.taskActiveStage.findUnique({
        where: {
          taskId_stageId: {
            taskId,
            stageId: revertToStageId,
          },
        },
      });

      if (existingTargetStage) {
        // Reactivate existing entry
        await tx.taskActiveStage.update({
          where: { id: existingTargetStage.id },
          data: {
            status: "ACTIVE",
            assigneeId: null, // Return to backlog
            completedAt: null,
          },
        });
      } else {
        // Create new active stage entry
        await tx.taskActiveStage.create({
          data: {
            taskId,
            stageId: revertToStageId,
            status: "ACTIVE",
            assigneeId: null, // Return to backlog
          },
        });
      }

      // 4c. Create new stage log entry for re-entering this stage
      await tx.taskStageLog.create({
        data: {
          taskId,
          stageId: revertToStageId,
          userId: currentUserId,
          enteredAt: new Date(),
          exitedAt: null,
          status: "REVERTED_TO",
        },
      });

      // 4d. Add comment explaining the reversion
      const userName = userWithRole?.name || user.email;
      const stageNames = currentActiveStages.map(as => as.stage.name).join(", ");

      await tx.taskComment.create({
        data: {
          taskId,
          userId: currentUserId,
          content: `**TAREFA REVERTIDA** por ${userName}\n\nDe: ${stageNames}\nPara: ${targetStage.name}\n\n**Motivo:** ${comment.trim()}\n\nData: ${new Date().toLocaleString('pt-BR')}`,
        },
      });

      // 4e. Update task status to BACKLOG (since returned to backlog)
      await tx.task.update({
        where: { id: taskId },
        data: {
          status: "BACKLOG",
          assigneeId: null,
        },
      });
    });

    // 5. Revalidate paths
    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath("/admin/tasks");
    revalidatePath("/dashboard");
    revalidatePath(`/tasks/${taskId}`);

    return {
      success: true,
      message: `Tarefa revertida para a etapa "${targetStage.name}"`,
    };
  } catch (error) {
    console.error("Error reverting task stage:", error);
    return { error: "Erro ao reverter tarefa" };
  }
}

// ========== Task Comments & Artifacts ==========

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
    // Get the task to find its project
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        projectId: true,
        activeStages: {
          where: { status: "ACTIVE" },
          select: { stageId: true },
          take: 1,
        },
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
        stageId: task.activeStages[0]?.stageId || null, // Associate with first active stage
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

// ========== Task Assignment (Team Validation) ==========

/**
 * Allows a user to claim (self-assign) an unassigned task from their team's backlog.
 * ✅ VALIDATION: User must belong to the team of the current stage.
 */
export async function claimTask(taskId: string) {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;

  try {
    // DEPRECATED: Old claimTask function for task-level assignment
    // New system uses claimActiveStage for stage-level assignment
    return { error: "Esta função foi depreciada. Use claimActiveStage() para reivindicar etapas específicas." };
  } catch (error) {
    console.error("Error claiming task:", error);
    return { error: "Erro ao reivindicar tarefa" };
  }
}

export async function assignTask(taskId: string, targetUserId: string) {
  await requireMemberOrHigher(); // Ensure user is authenticated

  try {
    // DEPRECATED: Old assignTask function for task-level assignment
    // New system uses claimActiveStage for stage-level assignment with automatic team validation
    return { error: "Esta função foi depreciada. Use claimActiveStage() para atribuir etapas específicas." };
  } catch (error) {
    console.error("Error assigning task:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to assign task",
    };
  }
}
