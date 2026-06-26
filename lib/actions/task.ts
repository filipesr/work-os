"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { Prisma, type ActiveStageStatus } from "@prisma/client";
import { auth } from "@/auth";
import { requireMemberOrHigher, getSessionUser } from "@/lib/permissions";
import { createTaskSchema } from "@/lib/validations";
import {
  createTaskStages,
  parseStageAssignments,
  isValidStageAssignee,
} from "@/lib/stage-assignment-helpers";
import type { ActiveStageWithDetails, MyAllStagesResult } from "@/types/task";

// Re-export types for backward compatibility
export type { ActiveStageWithDetails, MyAllStagesResult } from "@/types/task";

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

  // Extract and validate form data with Zod
  const parsed = createTaskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    projectId: formData.get("projectId"),
    templateId: formData.get("templateId"),
    priority: formData.get("priority"),
    dueDate: formData.get("dueDate"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message);
  }

  const { title, description, projectId, templateId, priority, dueDate: dueDateStr } = parsed.data;

  // Convert dueDate string to Date if provided
  const dueDate = dueDateStr ? new Date(dueDateStr) : null;

  const assignments = parseStageAssignments(formData);

  // Execute task creation within a transaction
  const task = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const newTask = await tx.task.create({
      data: {
        title,
        description: description || null,
        priority: priority || "MEDIUM",
        dueDate,
        status: "BACKLOG",
        projectId,
        assigneeId: null,
      },
    });

    await createTaskStages(tx, {
      taskId: newTask.id,
      templateId,
      userId,
      assignments,
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

/**
 * Creates one task per selected project from a single template, all sharing the
 * same title and due date. Used by the monthly event calendar for batch creation
 * (e.g. "create an Easter LP demand for 5 projects at once").
 */
export async function createTasksBatch(input: {
  projectIds: string[];
  templateId: string;
  title: string;
  dueDate: string;
}): Promise<{ created: number }> {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;

  const title = input.title?.trim();
  const projectIds = Array.from(new Set(input.projectIds ?? []));

  if (!title) throw new Error("O título é obrigatório.");
  if (!input.templateId) throw new Error("Selecione um template de fluxo de trabalho.");
  if (projectIds.length === 0) throw new Error("Selecione ao menos um projeto.");

  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (!dueDate || Number.isNaN(dueDate.getTime())) throw new Error("Data de vencimento inválida.");

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true },
  });
  const validIds = projects.map((p) => p.id);
  if (validIds.length === 0) throw new Error("Nenhum projeto válido selecionado.");

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const projectId of validIds) {
      const task = await tx.task.create({
        data: {
          title,
          description: null,
          priority: "MEDIUM",
          dueDate,
          status: "BACKLOG",
          projectId,
          assigneeId: null,
        },
      });
      await createTaskStages(tx, { taskId: task.id, templateId: input.templateId, userId });
    }
  });

  revalidatePath("/reports/calendar/monthly");
  revalidatePath("/admin/tasks");
  revalidatePath("/dashboard");

  return { created: validIds.length };
}

// ========== Helper Functions ==========

/**
 * Get all projects for selection
 */
export async function getProjectsForSelect(): Promise<
  Array<{
    id: string;
    name: string;
    clientId: string;
    client: { name: string };
  }>
> {
  await getCurrentUser();

  // Only active projects can receive new demands.
  return prisma.project.findMany({
    where: { status: "ACTIVE" },
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
      artifacts: {
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
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!task) return null;

  // Add computed properties for backward compatibility
  const currentActiveStage = task.activeStages.find((as) => as.status === "ACTIVE");

  return {
    ...task,
    currentStage: currentActiveStage ? currentActiveStage.stage : null,
    currentStageId: currentActiveStage ? currentActiveStage.stageId : null,
    // Override assignee with the assignee from the active stage
    assignee: currentActiveStage?.assignee || task.assignee,
  };
}

export type TaskListFilters = {
  status?: TaskStatus;
  priority?: TaskPriority;
  assignment?: "assigned" | "unassigned";
  clientId?: string;
  teamId?: string;
  quick?: "pending" | "overdue" | "completed" | "week";
};

export type TaskListSort = "recent" | "dueDate" | "priority";

/**
 * Returns the Monday→Sunday range (local time) that contains `now`.
 */
function getWeekRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const diffToMonday = (start.getDay() + 6) % 7; // 0 = Monday
  start.setDate(start.getDate() - diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

const OPEN_STAGE_STATUSES: ActiveStageStatus[] = ["ACTIVE", "BLOCKED"];

/**
 * Teams list for filter dropdowns. Manager+ can read (mirrors getClients).
 */
export async function getTeamsForFilter() {
  await requireMemberOrHigher();
  return prisma.team.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Get all tasks (with optional filtering and sorting)
 */
export async function getTasks(options?: {
  page?: number;
  pageSize?: number;
  filters?: TaskListFilters;
  sort?: TaskListSort;
}) {
  await getCurrentUser();

  const { DEFAULT_PAGE_SIZE, paginate } = await import("@/lib/pagination");
  const page = options?.page && options.page > 0 ? options.page : 1;
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const filters = options?.filters ?? {};
  const sort = options?.sort ?? "recent";

  const and: Prisma.TaskWhereInput[] = [];

  if (filters.status) and.push({ status: filters.status });
  if (filters.priority) and.push({ priority: filters.priority });
  if (filters.clientId) and.push({ project: { clientId: filters.clientId } });
  if (filters.teamId) {
    and.push({
      activeStages: {
        some: { status: { in: OPEN_STAGE_STATUSES }, stage: { defaultTeamId: filters.teamId } },
      },
    });
  }

  if (filters.assignment === "assigned") {
    and.push({
      OR: [
        { assigneeId: { not: null } },
        {
          activeStages: {
            some: { status: { in: OPEN_STAGE_STATUSES }, assigneeId: { not: null } },
          },
        },
      ],
    });
  } else if (filters.assignment === "unassigned") {
    and.push({
      assigneeId: null,
      activeStages: { none: { status: { in: OPEN_STAGE_STATUSES }, assigneeId: { not: null } } },
    });
  }

  if (filters.quick === "pending") {
    and.push({ status: { in: ["BACKLOG", "IN_PROGRESS", "PAUSED"] } });
  } else if (filters.quick === "completed") {
    and.push({ status: "COMPLETED" });
  } else if (filters.quick === "overdue") {
    and.push({ dueDate: { lt: new Date() }, status: { notIn: ["COMPLETED", "CANCELLED"] } });
  } else if (filters.quick === "week") {
    const { start, end } = getWeekRange(new Date());
    and.push({ dueDate: { gte: start, lte: end } });
  }

  const where: Prisma.TaskWhereInput = and.length ? { AND: and } : {};

  let orderBy: Prisma.TaskOrderByWithRelationInput[];
  if (sort === "dueDate") {
    orderBy = [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
  } else if (sort === "priority") {
    orderBy = [{ priority: "desc" }, { createdAt: "desc" }];
  } else {
    orderBy = [{ createdAt: "desc" }];
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        project: {
          include: { client: true },
        },
        assignee: {
          select: { id: true, name: true, email: true },
        },
        activeStages: {
          where: { status: { in: ["ACTIVE", "BLOCKED"] } },
          include: {
            stage: {
              include: { template: true, defaultTeam: true },
            },
            assignee: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { stage: { order: "asc" } },
        },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.task.count({ where }),
  ]);

  const items = tasks.map((task) => {
    const currentActiveStage = task.activeStages.find((as) => as.status === "ACTIVE");
    return {
      ...task,
      currentStage: currentActiveStage ? currentActiveStage.stage : null,
      currentStageId: currentActiveStage ? currentActiveStage.stageId : null,
      assignee: currentActiveStage?.assignee || task.assignee,
    };
  });

  return paginate(items, total, page, pageSize);
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
    // Fetch task + current user's role in parallel (independent queries)
    const [task, userWithRole] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        include: {
          assignee: true,
          project: {
            include: {
              client: true,
            },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true },
      }),
    ]);

    if (!task) {
      return { error: "Tarefa não encontrada" };
    }

    // Check permissions: must be admin, manager, or the assignee themselves
    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = task.assigneeId === currentUserId;

    if (!isAdmin && !isManager && !isAssignee) {
      return {
        error: "Apenas administradores, gerentes ou o responsável atual podem desatribuir tarefas",
      };
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
        content: `**TAREFA DESATRIBUÍDA** por ${userName}\nAnterior: ${previousAssignee}\nData: ${new Date().toLocaleString("pt-BR")}`,
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
    // Fetch task + current user's role in parallel (independent queries)
    const [task, userWithRole] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        include: {
          assignee: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true },
      }),
    ]);

    if (!task) {
      return { error: "Tarefa não encontrada" };
    }

    // Check permissions: must be admin, manager, or the assignee
    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = task.assigneeId === currentUserId;

    if (!isAdmin && !isManager && !isAssignee) {
      return {
        error: "Apenas administradores, gerentes ou o responsável atual podem concluir tarefas",
      };
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
        content: `**TAREFA CONCLUÍDA** por ${userName}\nData: ${new Date().toLocaleString("pt-BR")}`,
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

    type DependentStage = (typeof dependentStages)[number]["stage"];
    const activated: DependentStage[] = [];
    const blocked: DependentStage[] = [];

    // 3. Para cada dependente, transicionar a linha PRÉ-CRIADA (nunca criar do zero).
    for (const dep of dependentStages) {
      const stage = dep.stage;

      // 3a. Fetch existing row first — avoid the dependency query for stages
      //     already ACTIVE or COMPLETED (no-regress guard).
      const existing = await prisma.taskActiveStage.findUnique({
        where: { taskId_stageId: { taskId, stageId: stage.id } },
      });

      // Já trabalhada/finalizada: não regredir.
      if (existing && (existing.status === "ACTIVE" || existing.status === "COMPLETED")) {
        continue;
      }

      // 3b. Only now compute dependency status (skipped for ACTIVE/COMPLETED above).
      const allDepsComplete = await checkAllDependenciesComplete(taskId, stage.id);
      const nextStatus: ActiveStageStatus = allDepsComplete ? "ACTIVE" : "BLOCKED";

      // 3c. BLOCKED→BLOCKED: already blocked and still partially unmet — skip the
      //     no-op write so the stage does NOT appear in the returned `blocked` array.
      if (existing && existing.status === "BLOCKED" && !allDepsComplete) {
        continue;
      }

      // Transição preservando assigneeId (NÃO incluir assigneeId no data).
      // upsert cobre tarefas legadas sem a linha pré-criada (backfill tolerante).
      await prisma.taskActiveStage.upsert({
        where: { taskId_stageId: { taskId, stageId: stage.id } },
        update: { status: nextStatus },
        create: { taskId, stageId: stage.id, status: nextStatus },
      });

      if (nextStatus === "ACTIVE") activated.push(stage);
      else blocked.push(stage);
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
export async function completeStageAndAdvance(
  taskId: string,
  stageId: string,
  assignments?: Record<string, string>
) {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id as string;

  try {
    // 1. Get current active stage + current user's role in parallel
    const [activeStage, userWithRole] = await Promise.all([
      prisma.taskActiveStage.findUnique({
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
      }),
      prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true },
      }),
    ]);

    if (!activeStage) {
      return { error: "Etapa ativa não encontrada" };
    }

    if (activeStage.status !== "ACTIVE") {
      return { error: "Esta etapa não está ativa" };
    }

    // 2. Check permissions
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
          error:
            "Você precisa adicionar pelo menos 1 artefato ou comentário antes de completar esta etapa.",
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

    // Atribuição opcional das próximas etapas (frente A), validada por equipe.
    if (assignments && Object.keys(assignments).length > 0) {
      const nextStages = [...activated, ...blocked]; // cada item tem id + defaultTeam? carregamos membros
      for (const next of nextStages) {
        const requested = assignments[next.id];
        if (!requested) continue;
        const stageTeam = await prisma.templateStage.findUnique({
          where: { id: next.id },
          select: {
            id: true,
            defaultTeamId: true,
            defaultTeam: { select: { members: { select: { id: true } } } },
          },
        });
        if (stageTeam && isValidStageAssignee(stageTeam, requested)) {
          await prisma.taskActiveStage.update({
            where: { taskId_stageId: { taskId, stageId: next.id } },
            data: { assigneeId: requested },
          });
        }
      }
    }

    // 6. Add comment if admin/manager moved without being assignee
    if ((isAdmin || isManager) && !isAssignee) {
      const userName = currentUser.name || currentUser.email;
      const userRole = userWithRole?.role;
      await prisma.taskComment.create({
        data: {
          taskId,
          userId: currentUserId,
          content: `**ETAPA CONCLUÍDA POR ${userRole}** ${userName}\nEtapa: ${activeStage.stage.name}\nData: ${new Date().toLocaleString("pt-BR")}\n\n⚠️ Esta etapa foi concluída manualmente por um ${userRole === "ADMIN" ? "administrador" : "gerente"}.`,
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
      assignee: {
        select: { id: true, name: true, email: true },
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
 * Types for getMyAllStages — defined in @/types/task.ts
 */

/**
 * Get all stages assigned to current user with optional filters and stats
 */
export async function getMyAllStages(filters?: {
  status?: "INACTIVE" | "ACTIVE" | "BLOCKED" | "COMPLETED" | null;
  startDate?: string | null;
  endDate?: string | null;
  onlyMine?: boolean;
}): Promise<MyAllStagesResult> {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id as string;
  const onlyMine = filters?.onlyMine !== false;

  // Build where clause
  const where: Record<string, unknown> = {};

  if (onlyMine) {
    where.assigneeId = currentUserId;
  }

  if (filters?.status) {
    where.status = filters.status;
  } else {
    // Exclude INACTIVE stages by default; callers must pass status: "INACTIVE"
    // explicitly to see pre-created-but-not-yet-reached stages.
    where.status = { not: "INACTIVE" };
  }

  if (filters?.startDate || filters?.endDate) {
    const activatedAtFilter: Record<string, Date> = {};
    if (filters.startDate) {
      activatedAtFilter.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      // Set end date to end of day
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999);
      activatedAtFilter.lte = endDate;
    }
    where.activatedAt = activatedAtFilter;
  }

  const stages = await prisma.taskActiveStage.findMany({
    where,
    include: {
      assignee: {
        select: {
          name: true,
          email: true,
        },
      },
      task: {
        include: {
          project: {
            select: {
              name: true,
            },
          },
          timeLogs: {
            ...(onlyMine ? { where: { userId: currentUserId } } : {}),
            select: {
              hoursSpent: true,
            },
          },
        },
      },
      stage: {
        include: {
          template: {
            select: {
              id: true,
              name: true,
            },
          },
          defaultTeam: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      task: {
        dueDate: "asc",
      },
    },
  });

  // Compute stats
  const now = new Date();
  let totalHoursLogged = 0;
  const byStatus = { INACTIVE: 0, ACTIVE: 0, BLOCKED: 0, COMPLETED: 0 };
  const byPriority = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
  let overdue = 0;

  for (const stage of stages) {
    byStatus[stage.status]++;
    byPriority[stage.task.priority]++;
    if (stage.task.dueDate && new Date(stage.task.dueDate) < now && stage.status !== "COMPLETED") {
      overdue++;
    }
    totalHoursLogged += stage.task.timeLogs.reduce((sum, log) => sum + log.hoursSpent, 0);
  }

  // Map stages to remove timeLogs from response (used only for stats)
  const mappedStages: ActiveStageWithDetails[] = stages.map((s) => ({
    id: s.id,
    status: s.status,
    taskId: s.taskId,
    stageId: s.stageId,
    assigneeId: s.assigneeId,
    activatedAt: s.activatedAt,
    completedAt: s.completedAt,
    assignee: s.assignee ? { name: s.assignee.name, email: s.assignee.email } : null,
    task: {
      id: s.task.id,
      title: s.task.title,
      priority: s.task.priority,
      status: s.task.status,
      dueDate: s.task.dueDate,
      createdAt: s.task.createdAt,
      project: {
        name: s.task.project.name,
      },
    },
    stage: {
      id: s.stage.id,
      name: s.stage.name,
      order: s.stage.order,
      defaultTeam: s.stage.defaultTeam,
      template: s.stage.template,
    },
  }));

  return {
    stages: mappedStages,
    stats: {
      total: stages.length,
      byStatus,
      byPriority,
      overdue,
      totalHoursLogged,
    },
  };
}

/**
 * Get team backlog (active stages not assigned)
 */
export async function getTeamBacklog(teamIds: string[]) {
  if (teamIds.length === 0) return [];
  return await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: null,
      status: "ACTIVE",
      stage: {
        defaultTeamId: { in: teamIds },
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
        content: `**ETAPA REIVINDICADA** por ${userName}\nEtapa: ${activeStage.stage.name}\nData: ${new Date().toLocaleString("pt-BR")}`,
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
    // Fetch active stage + current user's role in parallel (independent queries)
    const [activeStage, userWithRole] = await Promise.all([
      prisma.taskActiveStage.findUnique({
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
      }),
      prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true },
      }),
    ]);

    if (!activeStage) {
      return { error: "Etapa ativa não encontrada" };
    }

    // Check permissions
    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = activeStage.assigneeId === currentUserId;

    if (!isAdmin && !isManager && !isAssignee) {
      return {
        error: "Apenas administradores, gerentes ou o responsável atual podem desatribuir etapas",
      };
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
    const previousAssignee =
      activeStage.assignee?.name || activeStage.assignee?.email || "Não atribuído";

    await prisma.taskComment.create({
      data: {
        taskId,
        userId: currentUserId,
        content: `**ETAPA DESATRIBUÍDA** por ${userName}\nEtapa: ${activeStage.stage.name}\nAnterior: ${previousAssignee}\nData: ${new Date().toLocaleString("pt-BR")}`,
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
    // The current position is defined by the lowest-order active/blocked stage.
    const activeStages = await prisma.taskActiveStage.findMany({
      where: { taskId, status: { in: ["ACTIVE", "BLOCKED"] } },
      include: { stage: { select: { order: true } } },
    });

    // No active stage (e.g. completed task) → nothing to revert to.
    if (activeStages.length === 0) return [];

    const currentMinOrder = Math.min(...activeStages.map((as) => as.stage.order));

    // Stages this task has actually visited (closed logs).
    const stageLogs = await prisma.taskStageLog.findMany({
      where: {
        taskId: taskId,
        exitedAt: { not: null },
      },
      include: {
        stage: true,
      },
      orderBy: { exitedAt: "desc" },
    });

    // Unique stages, but only genuine PREVIOUS ones (order strictly below the
    // current position). This prevents "reverting forward" and infinite reverts
    // at the first stage.
    const uniqueStages = Array.from(
      new Map(stageLogs.map((log) => [log.stage.id, log.stage])).values()
    ).filter((stage) => stage.order < currentMinOrder);

    return uniqueStages;
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
export async function advanceTaskStage(taskId: string, nextStageId: string) {
  const user = await requireMemberOrHigher();
  const currentUserId = user.id as string;

  try {
    // Check if user is admin or manager
    const userRole = user.role;
    const isAdminOrManager = userRole === "ADMIN" || userRole === "MANAGER";

    // 1. ✅ TEAM VALIDATION: Get user's team and verify next stage belongs to same team
    const userWithTeam = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { teams: { select: { id: true, name: true } } },
    });
    const userTeamIds = userWithTeam?.teams.map((tm) => tm.id) ?? [];

    // Admin/Manager can bypass team requirement
    if (!isAdminOrManager && userTeamIds.length === 0) {
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
    if (
      !isAdminOrManager &&
      userTeamIds.length > 0 &&
      nextStage.defaultTeamId &&
      !userTeamIds.includes(nextStage.defaultTeamId)
    ) {
      const userTeamNames = userWithTeam?.teams.map((tm) => tm.name).join(", ");
      return {
        error: `Você não pode avançar para a etapa "${nextStage.name}" porque ela pertence ao time "${nextStage.defaultTeam?.name}". Você faz parte do(s) time(s) "${userTeamNames}".`,
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
export async function revertTaskStage(taskId: string, revertToStageId: string, comment: string) {
  const user = await requireMemberOrHigher();
  const currentUserId = user.id as string;
  const userRole = user.role;

  if (!comment || comment.trim().length === 0) {
    return { error: "Um comentário explicando a reversão é obrigatório." };
  }

  try {
    // 1-3. Fetch target stage, current active stages, and user role in parallel
    // (independent reads — validations applied afterwards).
    const [targetStage, currentActiveStages, userWithRole] = await Promise.all([
      prisma.templateStage.findUnique({
        where: { id: revertToStageId },
        include: {
          template: true,
          defaultTeam: true,
        },
      }),
      prisma.taskActiveStage.findMany({
        where: {
          taskId,
          status: { in: ["ACTIVE", "BLOCKED"] },
        },
        include: {
          stage: true,
        },
      }),
      prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true, name: true },
      }),
    ]);

    if (!targetStage) {
      return { error: "Etapa de destino não encontrada" };
    }

    if (currentActiveStages.length === 0) {
      return { error: "Não há etapas ativas para reverter" };
    }

    // Guard: only allow reverting to a genuine PREVIOUS stage (lower order than
    // the current position). Prevents reverting forward / infinite reverts.
    const currentMinOrder = Math.min(...currentActiveStages.map((as) => as.stage.order));
    if (targetStage.order >= currentMinOrder) {
      return { error: "Só é possível reverter para uma etapa anterior." };
    }

    // Check permissions - must be admin, manager, or assignee of at least one active stage
    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = currentActiveStages.some((as) => as.assigneeId === currentUserId);

    if (!isAdmin && !isManager && !isAssignee) {
      return { error: "Você não tem permissão para reverter esta tarefa" };
    }

    // 4. Execute reversion in a transaction
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // 4a. Fechar logs abertos das etapas que estavam em andamento e marcá-las como REVERTED.
      for (const activeStage of currentActiveStages) {
        const openLog = await tx.taskStageLog.findFirst({
          where: { taskId, stageId: activeStage.stageId, exitedAt: null },
        });
        if (openLog) {
          await tx.taskStageLog.update({
            where: { id: openLog.id },
            data: { exitedAt: new Date(), status: "REVERTED" },
          });
        }
      }

      // 4b. Resetar TODAS as etapas a partir da alvo (inclusive posteriores) para INACTIVE.
      await tx.taskActiveStage.updateMany({
        where: { taskId, stage: { order: { gt: targetStage.order } } },
        data: { status: "INACTIVE", completedAt: null },
      });

      // 4c. Reativar a etapa-alvo (volta ao backlog: assignee preservado pode confundir → limpa).
      await tx.taskActiveStage.update({
        where: { taskId_stageId: { taskId, stageId: revertToStageId } },
        data: { status: "ACTIVE", assigneeId: null, completedAt: null },
      });

      // 4d. Novo log de entrada na etapa-alvo (em andamento → status null).
      await tx.taskStageLog.create({
        data: {
          taskId,
          stageId: revertToStageId,
          enteredAt: new Date(),
          exitedAt: null,
          userId: currentUserId,
        },
      });

      // 4e. Add comment explaining the reversion
      const userName = userWithRole?.name || user.email;
      const stageNames = currentActiveStages.map((as) => as.stage.name).join(", ");

      await tx.taskComment.create({
        data: {
          taskId,
          userId: currentUserId,
          content: `**TAREFA REVERTIDA** por ${userName}\n\nDe: ${stageNames}\nPara: ${targetStage.name}\n\n**Motivo:** ${comment.trim()}\n\nData: ${new Date().toLocaleString("pt-BR")}`,
        },
      });

      // 4f. Update task status to BACKLOG (since returned to backlog)
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
    return {
      error:
        "Esta função foi depreciada. Use claimActiveStage() para reivindicar etapas específicas.",
    };
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
    return {
      error: "Esta função foi depreciada. Use claimActiveStage() para atribuir etapas específicas.",
    };
  } catch (error) {
    console.error("Error assigning task:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to assign task",
    };
  }
}
