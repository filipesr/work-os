import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { TaskDetailView } from "@/components/tasks/TaskDetailView";
import { getAvailableNextStages, getPreviousStages } from "@/lib/actions/task";

interface TaskDetailPageProps {
  params: {
    taskId: string;
  };
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  // Fetch comprehensive task data
  const task = await prisma.task.findUnique({
    where: { id: params.taskId },
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
      currentStage: {
        include: {
          defaultTeam: true,
          template: true,
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

  if (!task) {
    notFound();
  }

  // Get available next and previous stages for State Machine controls
  const [availableNextStages, previousStages] = await Promise.all([
    getAvailableNextStages(params.taskId),
    getPreviousStages(params.taskId),
  ]);

  return (
    <div className="container mx-auto py-6">
      <TaskDetailView
        task={task}
        availableNextStages={availableNextStages}
        previousStages={previousStages}
        currentUserId={session.user.id!}
      />
    </div>
  );
}
