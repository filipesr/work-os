import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { TaskDetailView } from "@/components/tasks/TaskDetailView";
import { getAvailableNextStages, getPreviousStages } from "@/lib/actions/task";
import { getCurrentActiveLog } from "@/lib/actions/activity";

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
          client: true,
        },
      },
      assignee: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          teamId: true,
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
    },
  });

  if (!taskData) {
    notFound();
  }

  // Add computed properties for backward compatibility
  const currentActiveStage = taskData.activeStages.find(as => as.status === "ACTIVE");
  const task = {
    ...taskData,
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

  // Get available next and previous stages for State Machine controls
  // Also get the user's current active log (for activity tracking)
  const [availableNextStages, previousStages, activeLog] = await Promise.all([
    getAvailableNextStages(taskId),
    getPreviousStages(taskId),
    getCurrentActiveLog(session.user.id!),
  ]);

  return (
    <div className="container mx-auto py-6">
      <TaskDetailView
        task={task}
        availableNextStages={availableNextStages}
        previousStages={previousStages}
        currentUserId={session.user.id!}
        activeLog={activeLog}
        allTemplateStages={allTemplateStages}
      />
    </div>
  );
}
