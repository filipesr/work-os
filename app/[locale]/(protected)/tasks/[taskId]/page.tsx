import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { TaskDetailView } from "@/components/tasks/TaskDetailView";
import { mapArtifactRow } from "@/lib/artifacts/unify";
import { effectiveStageTeam } from "@/lib/stage-team";

interface TaskDetailPageProps {
  params: Promise<{
    taskId: string;
  }>;
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const { taskId } = await params;

  // Fetch comprehensive task data
  const taskData = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: {
        include: {
          client: {
            include: {
              artifacts: {
                where: { scope: "CLIENT", isCurrent: true },
                include: { user: { select: { name: true, email: true } } },
                orderBy: { createdAt: "desc" },
              },
            },
          },
          artifacts: {
            where: { scope: "PROJECT", isCurrent: true },
            include: { user: { select: { name: true, email: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      activeStages: {
        where: {
          status: { in: ["ACTIVE", "BLOCKED"] },
        },
        include: {
          stage: {
            include: {
              defaultTeam: true,
              template: true,
            },
          },
          team: { select: { id: true, name: true } },
          assignee: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
        orderBy: {
          stage: { order: "asc" },
        },
      },
      comments: {
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
        orderBy: {
          createdAt: "desc",
        },
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
        orderBy: {
          createdAt: "desc",
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
              image: true,
            },
          },
        },
        orderBy: {
          enteredAt: "desc",
        },
      },
      timeLogs: {
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
              order: true,
            },
          },
        },
        orderBy: {
          logDate: "desc",
        },
      },
    },
  });

  if (!taskData) {
    notFound();
  }

  // Add computed properties for backward compatibility
  const currentActiveStage = taskData.activeStages.find((as) => as.status === "ACTIVE");
  const task = {
    ...taskData,
    // O responsável da demanda É o da etapa em curso (igual a `getTaskById`). Havia um fallback
    // para `Task.assignee` aqui, coluna que nenhum caminho do fluxo escrevia — nunca valeu.
    assignee: currentActiveStage?.assignee ?? null,
    currentStage: currentActiveStage ? currentActiveStage.stage : null,
    currentStageId: currentActiveStage ? currentActiveStage.stageId : null,
  };

  // Get all stages from the template for workflow visualization
  const allTemplateStages = task.currentStage
    ? await prisma.templateStage.findMany({
        where: { templateId: task.currentStage.template.id },
        include: {
          defaultTeam: true,
        },
        orderBy: { order: "asc" },
      })
    : [];

  // Linhas unificadas: Tarefa + Projeto + Cliente (Origem por linha).
  const artifactRows = [
    ...task.artifacts.map((a) => mapArtifactRow(a, "TASK", { id: task.id, title: task.title })),
    ...task.project.artifacts.map((a) => mapArtifactRow(a, "PROJECT")),
    ...task.project.client.artifacts.map((a) => mapArtifactRow(a, "CLIENT")),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <TaskDetailView
        task={task}
        artifactRows={artifactRows}
        currentUserId={session.user.id!}
        currentUserRole={session.user.role!}
        allTemplateStages={allTemplateStages}
        currentStageTeam={currentActiveStage ? effectiveStageTeam(currentActiveStage) : null}
        currentStageInstructions={currentActiveStage?.instructions ?? null}
      />
    </div>
  );
}
