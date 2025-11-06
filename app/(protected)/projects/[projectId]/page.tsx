import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { KanbanBoard } from "@/components/projects/KanbanBoard";
import { auth } from "@/lib/auth";

interface ProjectPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  const { projectId } = await params;

  // Fetch project with all related data
  const projectData = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      tasks: {
        include: {
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
          project: {
            include: {
              client: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!projectData) {
    notFound();
  }

  // Add computed properties for backward compatibility
  const project = {
    ...projectData,
    tasks: projectData.tasks.map((task) => {
      const currentActiveStage = task.activeStages.find(as => as.status === "ACTIVE");
      return {
        ...task,
        currentStage: currentActiveStage ? currentActiveStage.stage : null,
        currentStageId: currentActiveStage ? currentActiveStage.stageId : null,
      };
    }),
  };

  // Collect all unique stages from the tasks
  // This gives us the columns for the Kanban board
  const stagesMap = new Map();

  project.tasks.forEach((task) => {
    if (task.currentStage) {
      const stage = task.currentStage;
      if (!stagesMap.has(stage.id)) {
        stagesMap.set(stage.id, {
          id: stage.id,
          name: stage.name,
          order: stage.order,
          templateId: stage.templateId,
          templateName: stage.template.name,
          defaultTeam: stage.defaultTeam,
        });
      }
    }
  });

  // Convert to array and sort by order
  const stages = Array.from(stagesMap.values()).sort((a, b) => a.order - b.order);

  // Get all unique workflow templates used in this project
  const templateIds = Array.from(
    new Set(project.tasks.map((t) => t.currentStage?.templateId).filter(Boolean))
  );

  const templates = await prisma.workflowTemplate.findMany({
    where: {
      id: { in: templateIds as string[] },
    },
    include: {
      stages: {
        orderBy: { order: "asc" },
        include: {
          defaultTeam: true,
        },
      },
    },
  });

  // Collect ALL stages from templates (not just the ones with tasks)
  // This ensures we show empty columns too
  const allStagesMap = new Map();
  templates.forEach((template) => {
    template.stages.forEach((stage) => {
      if (!allStagesMap.has(stage.id)) {
        allStagesMap.set(stage.id, {
          id: stage.id,
          name: stage.name,
          order: stage.order,
          templateId: stage.templateId,
          templateName: template.name,
          defaultTeam: stage.defaultTeam,
        });
      }
    });
  });

  const allStages = Array.from(allStagesMap.values()).sort((a, b) => a.order - b.order);

  return (
    <div className="container mx-auto py-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{project.name}</h1>
        <p className="text-muted-foreground">
          Cliente: {project.client.name}
        </p>
      </div>

      <KanbanBoard
        project={project}
        tasks={project.tasks}
        stages={allStages}
        currentUserId={session.user.id!}
        currentUserTeamId={session.user.teamId}
      />
    </div>
  );
}
