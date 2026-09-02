"use server";

import { cache } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { Prisma, type ActiveStageStatus, type ReworkKind } from "@prisma/client";
import { auth } from "@/auth";
import { requireMemberOrHigher, requireManagerOrAdmin, getSessionUser } from "@/lib/permissions";
import { createTaskSchema } from "@/lib/validations";
import { resolveDueDate } from "@/lib/task-due-date";
import { availableStageWhere } from "@/lib/task-availability";
import { stageTeamWhere, stageTeamInclude, effectiveStageTeam } from "@/lib/stage-team";
import {
  createTaskStages,
  parseStageAssignments,
  parseSelectedStages,
  parseStageTeams,
  parseStageInstructions,
  isValidStageAssignee,
  computeStageReadiness,
} from "@/lib/stage-assignment-helpers";
import { recordStageTransition, recordStageTransitions } from "@/lib/stage-transitions";
import { markTaskStarted } from "@/lib/task-start";
import { needsReason, type StageNoteReasonValue } from "@/lib/stage-completion-note";
import { getStageReferences } from "@/lib/planning/stage-reference";
import { closeActivityLog, hoursBetween } from "@/lib/activity-close";
import { realInstant } from "@/lib/dates";
import { buildInstructionComments } from "@/lib/stage-instruction";
import type { ActiveStageWithDetails, MyAllStagesResult } from "@/types/task";

// Re-export types for backward compatibility
export type { ActiveStageWithDetails, MyAllStagesResult } from "@/types/task";

// Helper to get current user. Cached per-request (React cache) so the session
// lookup dedupes across the many callers within a single render/action.
const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized: You must be logged in");
  }
  return session.user;
});

// Type definitions matching Prisma schema
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TaskStatus = "BACKLOG" | "IN_PROGRESS" | "PAUSED" | "COMPLETED" | "CANCELLED" | "OBSOLETE";

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
    noDueDate: formData.get("noDueDate"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message);
  }

  const {
    title,
    description,
    projectId,
    templateId,
    priority,
    dueDate: dueDateStr,
    noDueDate,
  } = parsed.data;

  // Prazo é obrigatório, a menos que a pessoa tenha MARCADO que esta demanda não tem. A tela
  // explica e bloqueia; esta checagem é a que vale — requisição fora da tela não passa por lá.
  // Ver `lib/task-due-date.ts` para o porquê de uma demanda sem prazo ser trabalho invisível.
  const prazo = resolveDueDate(dueDateStr, noDueDate === "on");
  if ("problem" in prazo) {
    const tTask = await getTranslations("errors.task");
    throw new Error(tTask(prazo.problem === "required" ? "dueDateRequired" : "invalidDueDate"));
  }
  const dueDate = prazo.date;

  const assignments = parseStageAssignments(formData);
  const selectedStageIds = parseSelectedStages(formData);
  // Etapas coringa (template sem time padrão): quem executa e o que precisa ser
  // feito são decididos aqui, na criação — é o único momento em que alguém
  // conhece a demanda concreta o bastante para dizer isso.
  const stageTeams = parseStageTeams(formData);
  const stageInstructions = parseStageInstructions(formData);

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
        workflowTemplateId: templateId,
        // Quem gerou a demanda assina a instrução das etapas dela — inclusive as que outra pessoa
        // vai executar. É por isso que este campo existe.
        createdById: userId,
      },
    });

    const { initialAssigned } = await createTaskStages(tx, {
      taskId: newTask.id,
      templateId,
      userId,
      assignments,
      selectedStageIds,
      teams: stageTeams,
      instructions: stageInstructions,
    });

    // Pré-atribuir a etapa inicial na criação já coloca a tarefa em andamento:
    // o fluxo de "reivindicar" (que promove BACKLOG→IN_PROGRESS) não roda quando
    // a etapa já nasce com responsável, então a tarefa ficaria presa em BACKLOG.
    if (initialAssigned) {
      await tx.task.update({ where: { id: newTask.id }, data: { status: "IN_PROGRESS" } });
      // Começou na criação → startedAt == createdAt, ou seja, queue time zero.
      // É a leitura correta: ninguém esperou na fila, o trabalho já tinha dono.
      await markTaskStarted(tx, newTask.id);
    }

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
  /** Data do calendário que estas demandas atendem. Criar a partir de uma data
   *  já nasce VINCULADO — é o que faz a cobertura da tela de datas subir sem
   *  ninguém precisar confirmar nada depois. */
  calendarOccurrenceId?: string;
  /** Início PLANEJADO (yyyy-mm-dd). Sugerido pelo prazo menos a duração do
   *  fluxo, e possivelmente editado pelo gestor — inclusive para depois do
   *  sugerido, que é uma compressão consciente do cronograma. */
  plannedStartAt?: string;
}): Promise<{ created: number }> {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;
  const t = await getTranslations("errors.batchCreate");

  const title = input.title?.trim();
  const projectIds = Array.from(new Set(input.projectIds ?? []));

  if (!title) throw new Error(t("titleRequired"));
  if (!input.templateId) throw new Error(t("templateRequired"));
  if (projectIds.length === 0) throw new Error(t("projectRequired"));

  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  if (!dueDate || Number.isNaN(dueDate.getTime())) throw new Error(t("invalidDueDate"));

  // Data inválida vira null em vez de erro: o início planejado é auxiliar ao
  // cronograma, e derrubar a criação da demanda inteira por causa dele seria
  // desproporcional.
  const plannedRaw = input.plannedStartAt ? new Date(input.plannedStartAt) : null;
  const plannedStartAt = plannedRaw && !Number.isNaN(plannedRaw.getTime()) ? plannedRaw : null;

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true },
  });
  const validIds = projects.map((p) => p.id);
  if (validIds.length === 0) throw new Error(t("noValidProject"));

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const projectId of validIds) {
      const task = await tx.task.create({
        data: {
          title,
          description: null,
          priority: "MEDIUM",
          dueDate,
          plannedStartAt,
          status: "BACKLOG",
          projectId,
          workflowTemplateId: input.templateId,
          calendarOccurrenceId: input.calendarOccurrenceId ?? null,
          // Este lote hoje não repassa teams/instructions, mas a demanda ainda precisa nascer
          // com autor — a promessa é "toda demanda nova", sem exceção por caminho de criação.
          createdById: userId,
        },
      });
      await createTaskStages(tx, { taskId: task.id, templateId: input.templateId, userId });
    }
  });

  revalidatePath("/planning/calendar/week");
  revalidatePath("/planning/calendar/month");
  revalidatePath("/planning/dates");
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
      // Previsão de cada etapa: a SOMA responde "quanto tempo este fluxo leva",
      // que é o que recua o prazo até o início sugerido.
      stages: { select: { expectedDurationHours: true } },
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
        where: { isCurrent: true },
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

  // Full stage pipeline (every stage, all statuses incl. INACTIVE) so the
  // detail page can show each stage's status and its responsible — including
  // people pre-assigned to upcoming stages at creation time.
  const stagePipeline = await prisma.taskActiveStage.findMany({
    where: { taskId },
    include: {
      stage: {
        select: {
          id: true,
          name: true,
          order: true,
          defaultTeam: { select: { id: true, name: true } },
        },
      },
      // Roteamento e direcionamento das etapas coringa, decididos na criação.
      ...stageTeamInclude,
      assignee: { select: { id: true, name: true, email: true } },
    },
    orderBy: { stage: { order: "asc" } },
  });

  // Add computed properties for backward compatibility
  const currentActiveStage = task.activeStages.find((as) => as.status === "ACTIVE");

  return {
    ...task,
    currentStage: currentActiveStage ? currentActiveStage.stage : null,
    currentStageId: currentActiveStage ? currentActiveStage.stageId : null,
    // O responsável da demanda É o da etapa em curso. Havia um `?? task.assignee` aqui, do tempo
    // da coluna no nível da demanda — que nenhum caminho escrevia, então o fallback nunca valeu.
    assignee: currentActiveStage?.assignee ?? null,
    stagePipeline,
  };
}

/**
 * Time tracking for a task: finalized manual time logs plus any OPEN activity
 * logs (work started but not yet stopped). Open activities are not yet TimeLogs,
 * so there is no double counting.
 */
export async function getTaskTimeTracking(taskId: string) {
  await getCurrentUser();

  const [timeLogs, openActivities] = await Promise.all([
    prisma.timeLog.findMany({
      where: { taskId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        stage: { select: { id: true, name: true, order: true } },
      },
      orderBy: { logDate: "desc" },
    }),
    prisma.activityLog.findMany({
      where: { taskId, endedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
  ]);

  return { timeLogs, openActivities };
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
        // Time EFETIVO — a etapa coringa pertence ao time roteado na criação.
        some: { status: { in: OPEN_STAGE_STATUSES }, ...stageTeamWhere(filters.teamId) },
      },
    });
  }

  // "Atribuída" = alguma etapa ABERTA tem dono. Havia um `OR` com `Task.assigneeId` aqui: como
  // nada escrevia a coluna, aquele ramo era sempre falso e só fazia o `where` parecer mais
  // completo do que era.
  if (filters.assignment === "assigned") {
    and.push({
      activeStages: {
        some: { status: { in: OPEN_STAGE_STATUSES }, assigneeId: { not: null } },
      },
    });
  } else if (filters.assignment === "unassigned") {
    and.push({
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
      assignee: currentActiveStage?.assignee ?? null,
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
 * Complete a task - Mark task as COMPLETED
 * Can be used by task assignee, admin, or manager
 */
export async function completeTask(taskId: string) {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id as string;
  const tTask = await getTranslations("errors.task");
  const tCommon = await getTranslations("errors.common");

  try {
    // Fetch task + current user's role in parallel (independent queries)
    const [task, userWithRole] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, status: true },
      }),
      prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true },
      }),
    ]);

    if (!task) {
      return { error: tCommon("taskNotFound") };
    }

    // Admin ou gestor. Havia um terceiro caso aqui — "ou o responsável pela demanda" —, mas ele
    // comparava contra `Task.assigneeId`, coluna que nenhum caminho do fluxo escrevia: era sempre
    // falso, e na prática só admin e gestor já concluíam. Removê-lo não muda quem pode.
    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";

    if (!isAdmin && !isManager) {
      return {
        error: tTask("completeOnlyAssigneeOrManager"),
      };
    }

    // Check if task is already completed
    if (task.status === "COMPLETED") {
      return { error: tTask("taskAlreadyCompleted") };
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
    return { error: tTask("completeTaskFailed") };
  }
}

/**
 * Activate next stages after completing current stage (Fork/Join logic)
 * This implements parallel workflow: when a stage completes, it can activate multiple next stages
 */
export async function activateNextStages(taskId: string, completedStageId: string) {
  try {
    // 1. Mark current active stage as COMPLETED.
    await prisma.taskActiveStage.updateMany({
      where: { taskId, stageId: completedStageId, status: "ACTIVE" },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    await recordStageTransition(prisma, taskId, completedStageId, "COMPLETED");

    // 2. Current rows for this task = the INCLUDED stages. A template stage
    //    without a row here was left out of the task (optional/deselected).
    const rows = await prisma.taskActiveStage.findMany({
      where: { taskId },
      select: { stageId: true, status: true },
    });
    const includedStageIds = new Set(rows.map((r) => r.stageId));
    const completedStageIds = new Set(
      rows.filter((r) => r.status === "COMPLETED").map((r) => r.stageId)
    );
    const statusByStage = new Map(rows.map((r) => [r.stageId, r.status]));

    // 3. Load the full template dependency graph (includes excluded stages, which
    //    have no row) so readiness can treat them as satisfied (pass-through).
    const anchor = await prisma.templateStage.findUnique({
      where: { id: completedStageId },
      select: { templateId: true },
    });
    if (!anchor) return { activated: [], blocked: [] };

    const templateStages = await prisma.templateStage.findMany({
      where: { templateId: anchor.templateId },
      select: {
        id: true,
        name: true,
        // `dependents`, não `dependencies`: no schema, o campo com nome intuitivo é a relação
        // INVERSA (quem depende desta etapa). Os PRÉ-REQUISITOS estão em `dependents` — as linhas
        // em que esta etapa é a dependente. Ler o campo errado devolvia o próprio id da etapa,
        // então toda etapa parecia depender de si mesma e a ÚLTIMA da cadeia parecia não depender
        // de nada: concluir a primeira ativava a última, pulando o meio.
        dependents: { select: { dependsOnStageId: true } },
        defaultTeam: { select: { id: true, name: true, members: { select: { id: true } } } },
      },
    });
    const stageById = new Map(templateStages.map((s) => [s.id, s]));

    // 4. Recompute readiness for every included stage (pass-through built in).
    const transitions = computeStageReadiness({
      stages: templateStages.map((s) => ({
        id: s.id,
        dependsOnIds: s.dependents.map((d) => d.dependsOnStageId),
      })),
      includedStageIds,
      completedStageIds,
      statusByStage,
    });

    // 5. Apply only real changes — preserve assigneeId (never write it here).
    type TemplateStageNode = (typeof templateStages)[number];
    const activated: TemplateStageNode[] = [];
    const blocked: TemplateStageNode[] = [];
    for (const [stageId, next] of transitions) {
      if (statusByStage.get(stageId) === next) continue; // no-op
      await prisma.taskActiveStage.updateMany({
        where: { taskId, stageId },
        // Carimba blockedAt ao ENTRAR em BLOCKED (severidade real de bloqueio).
        data: next === "BLOCKED" ? { status: next, blockedAt: new Date() } : { status: next },
      });
      await recordStageTransition(prisma, taskId, stageId, next);
      const stage = stageById.get(stageId);
      if (!stage) continue;
      if (next === "ACTIVE") activated.push(stage);
      else blocked.push(stage);
    }

    // 6. A instrução vira conversa AQUI, e não na criação da demanda: é neste instante que alguém
    //    passa a poder executar a etapa, e é para essa pessoa que o direcionamento foi escrito.
    if (activated.length > 0) {
      const [task, linhas] = await Promise.all([
        prisma.task.findUnique({ where: { id: taskId }, select: { createdById: true } }),
        prisma.taskActiveStage.findMany({
          where: { taskId, stageId: { in: activated.map((s) => s.id) } },
          select: { id: true, instructions: true },
        }),
      ]);
      const comentarios = buildInstructionComments({
        taskId,
        createdById: task?.createdById ?? null,
        ativadas: linhas.map((l) => ({ activeStageId: l.id, instructions: l.instructions })),
      });
      if (comentarios.length > 0) await prisma.taskComment.createMany({ data: comentarios });
    }

    return { activated, blocked };
  } catch (error) {
    console.error("Error activating next stages:", error);
    throw error;
  }
}

/** Quanto já foi apontado nesta etapa e qual é a régua dela. A tela usa os dois para decidir o
 *  que pedir; a ação recalcula por conta, porque o que a tela mandou não é confiável. */
export async function getStageCompletionContext(taskId: string, stageId: string) {
  await getCurrentUser();
  const [agregado, referencias, abertos] = await Promise.all([
    prisma.timeLog.aggregate({ where: { taskId, stageId }, _sum: { hoursSpent: true } }),
    getStageReferences([stageId]),
    // TODOS os períodos abertos, não o primeiro: `openForUserId` é único por PESSOA, não por
    // etapa, então duas pessoas podem ter cronômetro na mesma etapa. Ler só um mostraria menos
    // hora do que `completeStageAndAdvance` vai somar — e a régua da tela divergiria da do
    // servidor, que é exatamente o beco sem saída que este contexto existe para evitar.
    prisma.activityLog.findMany({
      where: { taskId, stageId, endedAt: null },
      select: { startedAt: true },
    }),
  ]);
  // O cronômetro em aberto ainda não é TimeLog, mas já é trabalho feito. Sem somar aqui, a tela
  // mostra menos hora do que `completeStageAndAdvance` vai considerar ao validar — e o
  // pré-preenchido nasceria defasado antes mesmo de o diálogo abrir.
  const agora = new Date();
  const horasAbertas = abertos.reduce((soma, a) => soma + hoursBetween(a.startedAt, agora), 0);
  return {
    // Arredondado a 2 casas: a soma de floats escreve "2.9000000000000004" no campo
    // pré-preenchido, e a pessoa vê o sistema errando uma conta que ela sabe fazer de cabeça.
    loggedHours: Math.round(((agregado._sum.hoursSpent ?? 0) + horasAbertas) * 100) / 100,
    referenceHours: referencias.get(stageId)?.hours ?? 0,
  };
}

/**
 * Complete current stage and activate next stages (replaces advanceTaskStage)
 */
export async function completeStageAndAdvance(
  taskId: string,
  stageId: string,
  assignments?: Record<string, string>,
  apontamento?: { hours: number; reason?: StageNoteReasonValue; note?: string }
) {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id as string;
  const tTask = await getTranslations("errors.task");
  const tCommon = await getTranslations("errors.common");

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
      return { error: tCommon("activeStageNotFound") };
    }

    if (activeStage.status !== "ACTIVE") {
      return { error: tTask("stageNotActive") };
    }

    // 2. Check permissions
    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = activeStage.assigneeId === currentUserId;

    if (!isAdmin && !isManager && !isAssignee) {
      return { error: tTask("noPermissionCompleteStage") };
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
        return { error: tTask("evidenceRequired") };
      }
    }

    // --- Apontamento: a metade "realizado" de todas as telas de tempo nasce aqui ---
    //
    // Fica depois da checagem de evidência (e antes de qualquer escrita da conclusão): toda
    // recusa — permissão, evidência, hora, motivo — tem que deixar a etapa exatamente como
    // estava. Por isso a leitura do cronômetro aberto NÃO fecha nada ainda: fechar é escrita, e
    // uma recusa por hora ou por motivo faltando não pode ter gravado nada no caminho.
    const agora = new Date();
    // TODOS os períodos abertos desta etapa, não só o primeiro. `openForUserId` é único por
    // PESSOA, não por etapa: duas pessoas podem estar com o cronômetro na mesma etapa. Um
    // `findFirst` sem `orderBy` fechava um deles ao acaso e deixava o outro aberto para sempre
    // numa etapa já concluída — as horas dessa pessoa nunca entrariam em lugar nenhum. É o mesmo
    // defeito que o `updateMany` de `taskStageLog`, mais abaixo, já resolveu.
    const abertos = await prisma.activityLog.findMany({
      where: { taskId, stageId, endedAt: null },
      select: { id: true, userId: true, taskId: true, stageId: true, startedAt: true },
    });
    // Quanto os períodos abertos já valem, sem gravar nada — a mesma conta que `closeActivityLog`
    // fará depois, com o mesmo instante `agora`, para o número não mudar entre validar e fechar.
    const horasAbertas = abertos.reduce((soma, a) => soma + hoursBetween(a.startedAt, agora), 0);

    const agregado = await prisma.timeLog.aggregate({
      where: { taskId, stageId },
      _sum: { hoursSpent: true },
    });
    const jaGravado = agregado._sum.hoursSpent ?? 0;
    // O que já está trabalhado, gravado ou não: o período em aberto entra na conta desde já, ou
    // a etapa recusaria concluir por falta de hora com o cronômetro rodando na própria tela.
    const jaApontado = jaGravado + horasAbertas;
    const informado = apontamento?.hours;

    // O número tem que ser NÚMERO. Server Action é uma fronteira de rede: nada garante que o que
    // chegou em `hours` veio do diálogo. Com `"abc"` ali, as duas travas abaixo passavam batidas
    // (`"abc" < 3` é falso), `Math.max` virava `NaN`, `needsReason(NaN, ref)` era falso e
    // `diferenca > 0` também — a etapa concluía com zero hora e sem nota, exatamente o que esta
    // feature existe para impedir. Vale para `NaN`, `Infinity`, string e nulo.
    if (
      informado !== undefined &&
      (typeof informado !== "number" || !Number.isFinite(informado) || informado <= 0)
    ) {
      return { error: tTask("hoursMustBePositive") };
    }

    // Sem apontamento nenhum e sem número informado, não há o que concluir: a etapa fecharia
    // como se ninguém tivesse trabalhado nela.
    // (número não-positivo já foi recusado acima, com a sua própria mensagem)
    if (jaApontado <= 0 && informado === undefined) {
      return { error: tTask("hoursRequired") };
    }
    // Reduzir hora já GRAVADA por um campo de texto seria apagar período real, com início e fim.
    // A comparação é com `jaGravado`, não com `jaApontado`: o período em aberto segue correndo
    // entre a leitura do contexto (quando o diálogo abriu) e este instante (quando o servidor
    // valida), então qualquer número capturado na abertura já nasce um pouco defasado. Recusar por
    // essa defasagem recusaria o caminho mais comum do produto: aceitar o valor pré-preenchido com
    // o cronômetro ainda ligado.
    if (informado !== undefined && informado < jaGravado) {
      return { error: tTask("hoursBelowLogged") };
    }

    // O informado é PISO, não teto: o período em aberto vai virar TimeLog de qualquer jeito quando
    // fechar, poucas linhas abaixo. Aceitar um total menor que `jaApontado` seria uma mentira que o
    // próprio sistema desmente um segundo depois — por isso o total é o maior dos dois.
    const totalHoras = informado !== undefined ? Math.max(informado, jaApontado) : jaApontado;
    const referencias = await getStageReferences([stageId]);
    const referenceHours = referencias.get(stageId)?.hours ?? 0;

    if (needsReason(totalHoras, referenceHours) && !apontamento?.reason) {
      return { error: tTask("reasonRequired") };
    }

    // Toda validação passou — só agora é seguro escrever. As TRÊS escritas do apontamento vão
    // numa transação só: fechar o cronômetro, gravar o complementar e gravar a justificativa.
    // Soltas, uma falha na terceira deixava as duas primeiras gravadas e a etapa NÃO concluída —
    // cronômetro fechado, hora lançada e nenhuma justificativa, num estado que ninguém pediu e
    // que a pessoa só descobre tentando concluir de novo. `closeActivityLog` recebe um
    // `CloseWriter` justamente para poder rodar dentro da transação.
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Fecha os cronômetros abertos primeiro (cada um vira TimeLog, por conta de
      // `closeActivityLog`) e só então grava a diferença como complementar, contando o que os
      // fechamentos acabaram de gravar — senão o mesmo período entraria duas vezes.
      let jaLancado = jaGravado;
      for (const aberto of abertos) {
        const fechamento = await closeActivityLog(tx, aberto, agora);
        if (fechamento.recorded) jaLancado += fechamento.hoursSpent;
      }

      // A diferença vira apontamento complementar, com data de hoje. As horas são de quem FEZ o
      // trabalho — mesmo quando quem clica em concluir é o gestor.
      const diferenca = totalHoras - jaLancado;
      if (diferenca > 0) {
        await tx.timeLog.create({
          data: {
            taskId,
            stageId,
            userId: activeStage.assigneeId ?? currentUserId,
            hoursSpent: diferenca,
            logDate: new Date(),
          },
        });
      }

      if (apontamento?.reason) {
        await tx.stageCompletionNote.create({
          data: {
            taskId,
            stageId,
            userId: currentUserId,
            reason: apontamento.reason,
            note: apontamento.note?.trim() || null,
            hoursLogged: totalHoras,
            // A régua da época: o p50 se move, e sem ela ninguém reconstrói por que a
            // justificativa foi pedida.
            referenceHours,
          },
        });
      }
    });

    // 4. Fecha TODO log aberto desta etapa — não só o primeiro.
    //
    // Um `findFirst` fechava uma linha e deixava as outras abertas para sempre. A causa de haver
    // mais de uma foi corrigida na origem (reivindicar a etapa de entrada abria um segundo log
    // além do que a criação já tinha aberto), mas demanda que JÁ carrega a sobra precisa se
    // resolver ao concluir: log aberto para sempre contamina o tempo por etapa dos relatórios de
    // gargalo, e nada na tela denuncia.
    await prisma.taskStageLog.updateMany({
      where: { taskId, stageId, exitedAt: null },
      data: { exitedAt: new Date(), status: "COMPLETED" },
    });

    // 5. Activate next stages (fork/join logic)
    const { activated, blocked } = await activateNextStages(taskId, stageId);

    // Atribuição opcional das próximas etapas (frente A), validada por equipe.
    if (assignments && Object.keys(assignments).length > 0) {
      // Next stages carry no team membership — batch-fetch the teams for every
      // stage that has a requested assignment (was an N+1 findUnique per stage).
      const nextStages = [...activated, ...blocked];
      const requestedStageIds = nextStages.map((next) => next.id).filter((id) => assignments[id]);
      if (requestedStageIds.length > 0) {
        // A validação é contra o time EFETIVO: numa etapa coringa o time veio
        // do roteamento da criação, e checar só o `defaultTeam` (nulo) recusaria
        // toda atribuição — a etapa ficaria eternamente sem responsável.
        const [stageTeams, rows] = await Promise.all([
          prisma.templateStage.findMany({
            where: { id: { in: requestedStageIds } },
            select: {
              id: true,
              defaultTeamId: true,
              defaultTeam: { select: { members: { select: { id: true } } } },
            },
          }),
          // Sem filtrar por `teamId`: a mesma leitura serve a duas perguntas — qual o time
          // roteado (só as linhas com `teamId`) e QUEM já era o dono, que decide se esta
          // atribuição é um remanejamento.
          prisma.taskActiveStage.findMany({
            where: { taskId, stageId: { in: requestedStageIds } },
            select: {
              stageId: true,
              teamId: true,
              assigneeId: true,
              team: { select: { members: { select: { id: true } } } },
            },
          }),
        ]);
        const stageTeamById = new Map(stageTeams.map((s) => [s.id, s]));
        const routedMembersByStage = new Map(
          rows
            .filter((r) => r.teamId !== null)
            .map((r) => [r.stageId, new Set((r.team?.members ?? []).map((m) => m.id))])
        );
        const donoAtualByStage = new Map(rows.map((r) => [r.stageId, r.assigneeId]));
        for (const stageId of requestedStageIds) {
          const requested = assignments[stageId];
          const stageTeam = stageTeamById.get(stageId);
          const routed = routedMembersByStage.get(stageId);
          const valid = routed
            ? routed.has(requested)
            : !!stageTeam && isValidStageAssignee(stageTeam, requested);
          if (valid) {
            // Remanejar limpa a programação do dono ANTERIOR. `plannedDate`/`plannedOrder` são a
            // posição na fila de uma pessoa específica: mantidos na troca, o item apareceria na
            // grade do Bruno, no dia que era da Ana e com o número de ordem dela — uma semana que
            // ninguém escolheu. Zerados, ele volta ao poço e o gestor o põe no dia de quem passou
            // a fazê-lo. Só quando o dono MUDA: reafirmar o mesmo responsável não é remanejamento
            // e não pode desmanchar a programação já feita.
            //
            // A JANELA FIXA sai junto, e por um motivo mais forte: ela é compromisso combinado com
            // alguém de fora (o estúdio às 14h), para AQUELE dia e AQUELA pessoa. Sobrevivendo ao
            // remanejamento, o item chegaria ao novo dono já "agendado" numa hora que ninguém
            // marcou com ele — e como o dia foi zerado, a hora ficaria ancorada em nada. É a mesma
            // limpeza que `unscheduleStage` faz ao devolver a etapa ao poço.
            const donoAnterior = donoAtualByStage.get(stageId) ?? null;
            const remanejou = donoAnterior !== null && donoAnterior !== requested;
            await prisma.taskActiveStage.update({
              where: { taskId_stageId: { taskId, stageId } },
              data: {
                assigneeId: requested,
                assignedAt: new Date(),
                ...(remanejou
                  ? {
                      plannedDate: null,
                      plannedOrder: null,
                      scheduledStart: null,
                      scheduledEnd: null,
                    }
                  : {}),
              },
            });
          }
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

    // 7. Update task status. Etapas não incluídas (F1) não têm linha, então
    // qualquer linha ainda em ACTIVE/BLOCKED/INACTIVE significa "falta etapa".
    // Se nenhuma linha aberta restar, a última etapa fechou → concluir a tarefa.
    const remainingOpen = await prisma.taskActiveStage.count({
      where: {
        taskId,
        status: { in: ["ACTIVE", "BLOCKED", "INACTIVE"] },
      },
    });

    if (remainingOpen > 0) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "IN_PROGRESS" },
      });
      // Rede de segurança: admin/gerente pode concluir etapa de tarefa que
      // ninguém chegou a reivindicar. Write-once, então é no-op no caso normal.
      await markTaskStarted(prisma, taskId);
    } else {
      // Auto-conclusão: todas as etapas incluídas foram concluídas.
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      const userName = currentUser.name || currentUser.email;
      await prisma.taskComment.create({
        data: {
          taskId,
          userId: currentUserId,
          content: `**TAREFA CONCLUÍDA AUTOMATICAMENTE** ao encerrar a última etapa (${activeStage.stage.name})\nPor: ${userName}\nData: ${new Date().toLocaleString("pt-BR")}`,
        },
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
    return { error: tTask("completeStageFailed") };
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
      ...availableStageWhere(),
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
  // A demanda aparece A PARTIR do início planejado. Nunca some depois: uma que
  // já deveria ter começado e não começou é a que mais precisa ser vista.
  const where: Record<string, unknown> = { ...availableStageWhere() };

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
              client: { select: { name: true } },
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
      ...stageTeamInclude,
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
        client: { name: s.task.project.client.name },
      },
    },
    stage: {
      id: s.stage.id,
      name: s.stage.name,
      order: s.stage.order,
      expectedDurationHours: s.stage.expectedDurationHours,
      // Time EFETIVO: quem olha "minhas etapas" precisa ver o time que de fato
      // responde por ela, não o vazio que o template deixou na coringa.
      defaultTeam: effectiveStageTeam(s),
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
      // Time EFETIVO: uma etapa coringa roteada na criação pertence ao time
      // escolhido, não ao padrão do template (que aqui é justamente nenhum).
      ...stageTeamWhere(teamIds),
      // Demanda cujo início planejado ainda não chegou não é trabalho para
      // pegar hoje — apareceria como disponível e puxaria alguém para começar
      // cedo, gastando a folga que existe justamente para o imprevisto.
      ...availableStageWhere(),
    },
    include: {
      ...stageTeamInclude,
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
      ...stageTeamWhere(teamId),
    },
    include: {
      ...stageTeamInclude,
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
  const tTask = await getTranslations("errors.task");
  const tCommon = await getTranslations("errors.common");

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
      return { error: tCommon("activeStageNotFound") };
    }

    if (activeStage.status !== "ACTIVE") {
      return { error: tTask("stageNotClaimable") };
    }

    if (activeStage.assigneeId) {
      return { error: tTask("stageAlreadyAssigned") };
    }

    // WIP limit enforced as a PULL constraint: block claiming when this stage
    // already has `wipLimit` items in progress (ACTIVE + assigned). Automatic
    // dependency-driven activation is never blocked (it only creates unassigned
    // ACTIVE rows, which do not count as in-progress WIP).
    if (activeStage.stage.wipLimit != null) {
      const inProgress = await prisma.taskActiveStage.count({
        where: { stageId, status: "ACTIVE", assigneeId: { not: null } },
      });
      if (inProgress >= activeStage.stage.wipLimit) {
        return {
          error: (await getTranslations("errors.task"))("wipLimitReached", {
            inProgress,
            limit: activeStage.stage.wipLimit,
          }),
        };
      }
    }

    // A atribuição carrega no `where` as MESMAS condições que a leitura acima conferiu, e é o
    // banco — não o intervalo entre a consulta e a escrita — que decide quem levou a etapa.
    //
    // Sem isto há corrida real, e o poço é compartilhado: Ana e Bruno, do mesmo time, veem a
    // mesma etapa e clicam quase juntos. As duas leituras encontram `assigneeId` nulo, os dois
    // recebem "etapa assumida" e a etapa fica com quem escreveu por último — o outro atualiza a
    // tela e o trabalho sumiu, sem nenhuma mensagem dizendo o que aconteceu.
    //
    // `count === 0` significa que alguma das condições deixou de valer entre a leitura e a
    // escrita; na prática, alguém chegou antes. A resposta é a mesma recusa da checagem acima.
    const claimed = await prisma.taskActiveStage.updateMany({
      where: { id: activeStage.id, assigneeId: null, status: "ACTIVE" },
      data: { assigneeId: currentUserId, assignedAt: new Date() },
    });
    if (claimed.count === 0) {
      return { error: tTask("stageAlreadyAssigned") };
    }

    // Update Task status to IN_PROGRESS
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS" },
    });
    // Reivindicar é o caminho normal de saída da fila: aqui nasce o cycle time.
    // Write-once — reivindicar outra etapa depois não reinicia a contagem.
    await markTaskStarted(prisma, taskId);

    // Add comment
    const userName = currentUser.name || currentUser.email;
    await prisma.taskComment.create({
      data: {
        taskId,
        userId: currentUserId,
        content: `**ETAPA REIVINDICADA** por ${userName}\nEtapa: ${activeStage.stage.name}\nData: ${new Date().toLocaleString("pt-BR")}`,
      },
    });

    // Log de etapa só se ainda NÃO houver um aberto. A etapa de entrada já nasce com log aberto
    // em `createTaskStages` (ela começa ACTIVE na criação), então reivindicá-la abria um segundo:
    // o fechamento em `completeStageAndAdvance` fecha um, e o outro ficava aberto para sempre —
    // tempo por etapa contaminado nos relatórios de gargalo, sem nada na tela denunciando.
    const logAberto = await prisma.taskStageLog.findFirst({
      where: { taskId, stageId, exitedAt: null },
      select: { id: true },
    });
    if (!logAberto) {
      await prisma.taskStageLog.create({
        data: {
          taskId,
          stageId,
          userId: currentUserId,
          enteredAt: new Date(),
        },
      });
    }

    revalidatePath("/dashboard");
    revalidatePath(`/tasks/${taskId}`);

    return { success: true };
  } catch (error) {
    console.error("Error claiming active stage:", error);
    return { error: tTask("claimStageFailed") };
  }
}

/**
 * Unassign an active stage
 */
export async function unassignActiveStage(taskId: string, stageId: string) {
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser.id as string;
  const tTask = await getTranslations("errors.task");
  const tCommon = await getTranslations("errors.common");

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
      return { error: tCommon("activeStageNotFound") };
    }

    // Check permissions
    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = activeStage.assigneeId === currentUserId;

    if (!isAdmin && !isManager && !isAssignee) {
      return {
        error: tTask("unassignStageOnlyAssigneeOrManager"),
      };
    }

    await prisma.taskActiveStage.update({
      where: { id: activeStage.id },
      // A programação semanal sai JUNTO com o responsável: `plannedDate`/`plannedOrder` são
      // posição na fila de UMA pessoa, e sem dono o item ficaria ordenado na fila de quem não o
      // tem mais — invisível na grade (que só monta dia de quem tem responsável) e fora do poço se
      // este filtrasse por data. Limpando aqui, a etapa volta inteira para o poço.
      //
      // A JANELA FIXA também: ela é um compromisso PARA AQUELE DIA e AQUELA pessoa, e o dia acabou
      // de ser apagado. Deixada para trás, a etapa volta do poço já "agendada" num horário que
      // ninguém marcou — e a próxima programação a entrega a OUTRA pessoa com essa hora fantasma,
      // que a trava de sobreposição nunca examinou. Mesma limpeza de `unscheduleStage`.
      data: {
        assigneeId: null,
        plannedDate: null,
        plannedOrder: null,
        scheduledStart: null,
        scheduledEnd: null,
      },
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
    return { error: tTask("unassignStageFailed") };
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
 *
 * ⚠️ CÓDIGO MORTO — não há nenhum chamador no repositório (busca em 2026-08-27); a função termina
 * devolvendo o próprio aviso de depreciação, e quem move etapa hoje é `completeStageAndAdvance`.
 * Por isso as mensagens aqui dentro ficaram SEM tradução: traduzir texto que ninguém alcança é
 * trabalho que não chega a usuário nenhum. Candidata a remoção — fora do escopo desta passagem.
 */
export async function advanceTaskStage(taskId: string, nextStageId: string) {
  const user = await requireMemberOrHigher();
  const currentUserId = user.id as string;
  const tTask = await getTranslations("errors.task");

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
      return { error: tTask("noTeamAssigned") };
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
      return { error: tTask("targetStageNotFound") };
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
    // Texto mantido em português de propósito: é migalha de migração para quem
    // desenvolve (nomeia a função substituta), num caminho morto que a UI não
    // alcança — traduzir não serviria a usuário nenhum.
    return { error: "Esta função foi depreciada. Use completeStageAndAdvance() em vez disso." };
  } catch (error) {
    console.error("Error advancing task stage:", error);
    return { error: tTask("advanceFailed") };
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
  comment: string,
  kind: ReworkKind
) {
  const user = await requireMemberOrHigher();
  const currentUserId = user.id as string;
  const userRole = user.role;
  const tTask = await getTranslations("errors.task");

  if (!comment || comment.trim().length === 0) {
    return { error: tTask("revertCommentRequired") };
  }

  if (kind !== "INTERNAL" && kind !== "CLIENT") {
    return { error: tTask("invalidReworkKind") };
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
      return { error: tTask("targetStageNotFound") };
    }

    if (currentActiveStages.length === 0) {
      return { error: tTask("noActiveStagesToRevert") };
    }

    // Guard: only allow reverting to a genuine PREVIOUS stage (lower order than
    // the current position). Prevents reverting forward / infinite reverts.
    const currentMinOrder = Math.min(...currentActiveStages.map((as) => as.stage.order));
    if (targetStage.order >= currentMinOrder) {
      return { error: tTask("revertOnlyBackwards") };
    }

    // Guard: a etapa-alvo precisa FAZER PARTE desta tarefa. Etapa opcional
    // deixada de fora na criação (ou de outro template) não tem linha aqui — a
    // reversão a reativaria por `update`, que falharia com erro genérico. A UI
    // só oferece etapas percorridas, então isto é defesa de borda: a tarefa
    // volta para o que foi determinado na criação, nunca para fora dele.
    const targetRow = await prisma.taskActiveStage.findUnique({
      where: { taskId_stageId: { taskId, stageId: revertToStageId } },
      select: { id: true },
    });
    if (!targetRow) {
      return { error: tTask("stageNotInTask") };
    }

    // Check permissions - must be admin, manager, or assignee of at least one active stage
    const isAdmin = userWithRole?.role === "ADMIN";
    const isManager = userWithRole?.role === "MANAGER";
    const isAssignee = currentActiveStages.some((as) => as.assigneeId === currentUserId);

    if (!isAdmin && !isManager && !isAssignee) {
      return { error: tTask("noPermissionRevert") };
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
      const resetRows = await tx.taskActiveStage.findMany({
        where: { taskId, stage: { order: { gt: targetStage.order } } },
        select: { stageId: true },
      });
      await tx.taskActiveStage.updateMany({
        where: { taskId, stage: { order: { gt: targetStage.order } } },
        data: { status: "INACTIVE", completedAt: null },
      });
      await recordStageTransitions(
        tx,
        taskId,
        resetRows.map((r) => r.stageId),
        "INACTIVE"
      );

      // Captura quem executou a etapa-alvo ANTES de limpar o assignee (base do
      // FTR por pessoa — exceção deliberada a P2; nunca usado p/ ranking).
      const targetInstance = await tx.taskActiveStage.findUnique({
        where: { taskId_stageId: { taskId, stageId: revertToStageId } },
        select: { assigneeId: true },
      });
      const sourceAssigneeId = targetInstance?.assigneeId ?? null;

      // 4c. Reativar a etapa-alvo (volta ao backlog: assignee preservado pode confundir → limpa).
      // A programação semanal sai junto com o assignee: dia e ordem são posição na fila de UMA
      // pessoa: mantê-los sem dono deixaria o item ordenado na fila de quem não o tem mais, e sem
      // responsável ele não é montado em célula nenhuma da mesa semanal. A janela fixa sai pelo
      // mesmo motivo, um degrau acima: é compromisso combinado com alguém de fora PARA AQUELE dia
      // e AQUELA pessoa, e sobreviveria à reversão como uma hora marcada para ninguém — que a
      // próxima programação levaria intacta para a agenda de um terceiro.
      await tx.taskActiveStage.update({
        where: { taskId_stageId: { taskId, stageId: revertToStageId } },
        data: {
          status: "ACTIVE",
          assigneeId: null,
          plannedDate: null,
          plannedOrder: null,
          scheduledStart: null,
          scheduledEnd: null,
          completedAt: null,
        },
      });
      await recordStageTransition(tx, taskId, revertToStageId, "ACTIVE");

      // 4c-bis. Registrar o retrabalho atribuído à etapa-origem (a etapa-alvo).
      await tx.reworkEvent.create({
        data: {
          taskId,
          sourceStageId: revertToStageId,
          kind,
          reason: comment.trim(),
          byUserId: currentUserId,
          sourceAssigneeId,
        },
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
    return { error: tTask("revertFailed") };
  }
}

// ========== Task Comments & Artifacts ==========

export async function addComment(
  taskId: string,
  content: string,
  /** A etapa em que a conversa acontece. Nulo é conversa da DEMANDA (escrita em /admin): nem toda
   *  conversa é de etapa, e forçar uma escolha seria o chute que esta feature existe para remover. */
  activeStageId?: string | null
) {
  const user = await requireMemberOrHigher();
  const userId = user.id as string;

  if (!content || content.trim().length === 0) {
    return { error: (await getTranslations("errors.task"))("commentRequired") };
  }

  try {
    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        userId,
        content: content.trim(),
        activeStageId: activeStageId ?? null,
        kind: "USER",
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
    return { error: (await getTranslations("errors.task"))("artifactTitleRequired") };
  }

  if (!url || url.trim().length === 0) {
    return { error: (await getTranslations("errors.task"))("artifactUrlRequired") };
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

// ========== Time Logging (for BI/Reporting) ==========

/**
 * Log time spent on a task.
 * This creates a TimeLog entry for productivity reporting.
 *
 * `logDate` chega como DIA de calendário de São Paulo — o `<input type="date">` do formulário vira
 * `new Date("YYYY-MM-DD")`, meia-noite UTC, que é a convenção SP-local de `plannedDate`. Mas a
 * coluna `TimeLog.logDate` guarda INSTANTE REAL: as três outras origens de apontamento
 * (`activity-close.ts` ao parar o cronômetro, `quick-task.ts`, e a conclusão de etapa) gravam
 * `endedAt`/`completedAt`/`new Date()`. Gravar a representação SP-local numa coluna de instante
 * erra em três horas, e o erro só aparece na borda do dia: quem lê agrupando por São Paulo
 * (`/planning/client-load`) via o apontamento manual de terça cair na SEGUNDA, e o de segunda
 * escorregar para a fresta de três horas ANTES da semana — sem aparecer em nenhuma delas.
 *
 * Por isso a conversão acontece aqui, na origem, e não em cada leitura: uma coluna com duas
 * convenções é uma coluna que vai divergir na próxima tela que a somar.
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
    return { error: (await getTranslations("errors.task"))("taskIdRequired") };
  }

  if (!hoursSpent || hoursSpent <= 0) {
    return { error: (await getTranslations("errors.task"))("hoursMustBePositive") };
  }

  if (!logDate) {
    return { error: (await getTranslations("errors.task"))("logDateRequired") };
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
      return { error: (await getTranslations("errors.common"))("taskNotFound") };
    }

    // O dia informado vira o instante real da meia-noite daquele dia em São Paulo — ver o
    // cabeçalho desta função.
    const instanteDoDia = realInstant(logDate);

    // Create the time log entry
    const timeLog = await prisma.timeLog.create({
      data: {
        taskId,
        userId,
        hoursSpent,
        logDate: instanteDoDia,
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
  const tTask = await getTranslations("errors.task");

  try {
    // DEPRECATED: Old claimTask function for task-level assignment
    // New system uses claimActiveStage for stage-level assignment
    // Texto mantido em português de propósito: é migalha de migração para quem
    // desenvolve (nomeia a função substituta), num caminho morto que a UI não
    // alcança — traduzir não serviria a usuário nenhum.
    return {
      error:
        "Esta função foi depreciada. Use claimActiveStage() para reivindicar etapas específicas.",
    };
  } catch (error) {
    console.error("Error claiming task:", error);
    return { error: tTask("claimTaskFailed") };
  }
}

export async function assignTask(taskId: string, targetUserId: string) {
  await requireMemberOrHigher(); // Ensure user is authenticated

  try {
    // DEPRECATED: Old assignTask function for task-level assignment
    // New system uses claimActiveStage for stage-level assignment with automatic team validation
    // Texto mantido em português de propósito: é migalha de migração para quem
    // desenvolve (nomeia a função substituta), num caminho morto que a UI não
    // alcança — traduzir não serviria a usuário nenhum.
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

// ========== Obsolescência + duplicação (spec 2026-07-06) ==========

/** Marca a tarefa como OBSOLETE (arquival): sai de pendentes e do % do projeto. MANAGER+. */
export async function markTaskObsolete(taskId: string) {
  const user = await requireManagerOrAdmin();
  const tCommon = await getTranslations("errors.common");
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true },
    });
    if (!task) return { error: tCommon("taskNotFound") };

    await prisma.task.update({ where: { id: taskId }, data: { status: "OBSOLETE" } });
    await prisma.taskComment.create({
      data: {
        taskId,
        userId: user.id as string,
        content: `**TAREFA MARCADA COMO OBSOLETA**\nData: ${new Date().toLocaleString("pt-BR")}`,
      },
    });

    revalidatePath(`/admin/tasks/${taskId}`);
    revalidatePath(`/tasks/${taskId}`);
    revalidatePath("/admin/tasks");
    revalidatePath("/dashboard");
    if (task.projectId) revalidatePath(`/admin/projects/${task.projectId}`);
    return { success: true };
  } catch (error) {
    console.error("markTaskObsolete error:", error);
    return { error: (await getTranslations("errors.task"))("markObsoleteFailed") };
  }
}

/** Duplica a tarefa (só metadados): título+"(cópia)", descrição, projeto e o mesmo template, com
 * as MESMAS etapas incluídas recriadas frescas (status zerado); sem comentários, sem artefatos.
 * Redireciona para a nova tarefa (aberta para edição). MANAGER+.
 *
 * Carrega também o DESENHO das etapas coringa — time roteado e instrução — porque é a mesma
 * decisão que já viaja nas etapas opcionais incluídas. Duplicar é o caminho de conserto de uma
 * demanda que travou (obsoleta → duplica → corrige); fazer o gestor redecidir cada coringa do
 * zero para consertar UMA transformaria o conserto em retrabalho.
 *
 * O que deliberadamente NÃO viaja é o responsável: sem ele a cópia nasce em BACKLOG com
 * `startedAt` nulo — virgem — e por isso continua dentro da janela de correção
 * (ver lib/task-virgin.ts). Copiar o responsável travaria a cópia no mesmo instante. */
export async function duplicateTask(
  taskId: string,
  entrada?: { title?: string; dueDate: string; noDueDate: boolean }
) {
  const user = await requireManagerOrAdmin();
  const userId = user.id as string;
  const tTask = await getTranslations("errors.task");
  const tCommon = await getTranslations("errors.common");
  let newId: string | null = null;

  try {
    const original = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        title: true,
        description: true,
        priority: true,
        projectId: true,
        dueDate: true,
        activeStages: {
          select: {
            stageId: true,
            teamId: true,
            instructions: true,
            stage: { select: { templateId: true } },
          },
        },
      },
    });
    if (!original) return { error: tCommon("taskNotFound") };
    if (original.activeStages.length === 0) return { error: tTask("noStagesToDuplicate") };

    // A cópia é uma DEMANDA NOVA, e demanda nova decide o próprio prazo. Herdar o do original em
    // silêncio faria a cópia nascer quase sempre vencida — duplica-se justamente para refazer o
    // que não deu certo. E deixar sem prazo era a porta dos fundos da regra de criação: como
    // demanda não se edita neste sistema, a cópia ficaria invisível para cobertura, taxa de
    // entrega e atraso, sem conserto a não ser marcá-la obsoleta e recomeçar.
    // A tela abre com a data do original preenchida; quem duplica confirma ou troca.
    // Título editável porque duplicar serve a DOIS usos: corrigir uma demanda que travou (aí o
    // título é o mesmo, e a original já saiu das listas por estar obsoleta) e rodar o mesmo
    // desenho outra vez, para outro ciclo — e aí o título é outro. O sufixo "(cópia)" só
    // descrevia o primeiro caso, e atrapalhava o segundo.
    const titulo = (entrada?.title ?? original.title).trim();
    if (!titulo) return { error: tTask("titleRequired") };

    const prazo = resolveDueDate(entrada?.dueDate ?? "", entrada?.noDueDate ?? false);
    if ("problem" in prazo) {
      return {
        error: tTask(prazo.problem === "required" ? "dueDateRequired" : "invalidDueDate"),
      };
    }

    const templateId = original.activeStages[0].stage.templateId;
    const selectedStageIds = new Set(original.activeStages.map((s) => s.stageId));
    const teams = Object.fromEntries(
      original.activeStages.filter((s) => s.teamId).map((s) => [s.stageId, s.teamId as string])
    );
    const instructions = Object.fromEntries(
      original.activeStages
        .filter((s) => s.instructions)
        .map((s) => [s.stageId, s.instructions as string])
    );

    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const t = await tx.task.create({
        data: {
          title: titulo,
          description: original.description,
          priority: original.priority,
          status: "BACKLOG",
          projectId: original.projectId,
          dueDate: prazo.date,
          workflowTemplateId: templateId,
          // A duplicata é uma demanda NOVA: quem a colocou em jogo — com as instruções que ela
          // carrega das etapas originais — foi quem clicou em duplicar, não quem criou a
          // original. Assinar pelo criador original atribuiria a outra pessoa um direcionamento
          // que ela não deu para ESTA demanda.
          createdById: userId,
        },
      });
      await createTaskStages(tx, {
        taskId: t.id,
        templateId,
        userId,
        selectedStageIds,
        teams,
        instructions,
      });
      return t;
    });
    newId = created.id;

    revalidatePath("/admin/tasks");
    revalidatePath("/dashboard");
    if (original.projectId) revalidatePath(`/admin/projects/${original.projectId}`);
  } catch (error) {
    console.error("duplicateTask error:", error);
    return { error: (await getTranslations("errors.task"))("duplicateFailed") };
  }

  // redirect() lança — fora do try para não ser capturado.
  if (newId) redirect(`/admin/tasks/${newId}`);
}
