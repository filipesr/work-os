import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { computeProjectCompletion } from "@/lib/project-status";
import { mapArtifactRow } from "@/lib/artifacts/unify";
import { UnifiedArtifactsPanel } from "@/components/artifacts/UnifiedArtifactsPanel";
import { StorageBreakdown } from "@/components/nas/StorageBreakdown";
import { storageByTask } from "@/lib/nas/storage-stats";
import { EditProjectHeader } from "./edit-project-header";

const COMPLETION_STATE_LABEL: Record<string, string> = {
  empty: "Sem tarefas",
  pending: "Pendente",
  completed: "Concluído",
};

async function getProject(projectId: string) {
  await requireManagerOrAdmin();
  return await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      artifacts: {
        where: { scope: "PROJECT", isCurrent: true },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      tasks: {
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          artifacts: {
            where: { isCurrent: true },
            include: { user: { select: { name: true, email: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

async function getClients() {
  await requireManagerOrAdmin();
  return await prisma.client.findMany({
    orderBy: { name: "asc" },
  });
}

async function updateProject(formData: FormData) {
  "use server";
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const clientId = formData.get("clientId") as string;
  if (!id || !name || !clientId) return;

  await prisma.project.update({
    where: { id },
    data: {
      name,
      description: description || null,
      clientId,
    },
  });

  revalidatePath(`/admin/projects/${id}`);
  revalidatePath("/admin/projects");
}

async function deleteProject(formData: FormData) {
  "use server";
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  await prisma.project.delete({
    where: { id },
  });

  revalidatePath("/admin/projects");
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, clients, t] = await Promise.all([
    getProject(projectId),
    getClients(),
    getTranslations("admin.projects.detail"),
  ]);

  if (!project) {
    notFound();
  }

  const statusCounts = project.tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Derived completion (% + state) from task statuses — single source of truth.
  const completion = computeProjectCompletion(project.tasks);
  const taskStorage = await storageByTask(projectId);

  // Linhas unificadas: artefatos do Projeto + artefatos das Tarefas do projeto.
  const artifactRows = [
    ...project.artifacts.map((a) => mapArtifactRow(a, "PROJECT")),
    ...project.tasks.flatMap((task) =>
      task.artifacts.map((a) => mapArtifactRow(a, "TASK", { id: task.id, title: task.title }))
    ),
  ];

  const statusColors: Record<string, string> = {
    BACKLOG: "bg-gray-100 text-gray-800 border-gray-200",
    IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-200",
    COMPLETED: "bg-green-100 text-green-800 border-green-200",
    CANCELLED: "bg-red-100 text-red-800 border-red-200",
    PAUSED: "bg-yellow-100 text-yellow-800 border-yellow-200",
    OBSOLETE: "bg-muted text-muted-foreground border-border",
  };

  const priorityColors: Record<string, string> = {
    URGENT: "bg-red-100 text-red-800 border-red-200",
    HIGH: "bg-orange-100 text-orange-800 border-orange-200",
    MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-200",
    LOW: "bg-green-100 text-green-800 border-green-200",
  };

  return (
    <div className="container mx-auto p-8">
      <Link
        href={`/admin/clients/${project.clientId}`}
        className="inline-flex items-center text-primary hover:text-primary/80 mb-6 font-semibold transition-colors"
      >
        <svg
          className="w-5 h-5 mr-2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path d="M15 19l-7-7 7-7" />
        </svg>
        {t("backToProjects")}
      </Link>

      {/* Header Card */}
      <EditProjectHeader
        project={{
          id: project.id,
          name: project.name,
          description: project.description,
          clientId: project.clientId,
          clientName: project.client.name,
        }}
        clients={clients}
        updateProject={updateProject}
        deleteProject={deleteProject}
      />

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-6">
        <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
          <p className="text-sm text-muted-foreground">Conclusão</p>
          <p className="text-3xl font-bold text-foreground mt-1">{completion.pct}%</p>
          <p className="text-xs font-semibold text-muted-foreground mt-1">
            {COMPLETION_STATE_LABEL[completion.state]}
          </p>
        </div>
        <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
          <p className="text-sm text-muted-foreground">{t("totalTasks")}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{project.tasks.length}</p>
        </div>
        {(["BACKLOG", "IN_PROGRESS", "COMPLETED"] as const).map((status) => (
          <div key={status} className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
            <p className="text-sm text-muted-foreground">{t(`status.${status}`)}</p>
            <p className="text-3xl font-bold text-foreground mt-1">{statusCounts[status] || 0}</p>
          </div>
        ))}
        {/* Artifacts total, next to "Concluída" */}
        <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
          <p className="text-sm text-muted-foreground">{t("artifacts")}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{artifactRows.length}</p>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-foreground">{t("tasksTable")}</h2>
          <Link
            href={`/admin/tasks/new?projectId=${project.id}`}
            className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-sm hover:shadow-md transition-all duration-200"
          >
            {t("createTask")}
          </Link>
        </div>
        <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("taskTitle")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("taskStatus")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("taskPriority")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("taskAssignee")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("taskDueDate")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {project.tasks.map((task) => (
                <tr key={task.id} className="hover:bg-accent transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/admin/tasks/${task.id}`}
                      className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                    >
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 inline-flex text-xs font-bold rounded-full border ${statusColors[task.status] || ""}`}
                    >
                      {t(`status.${task.status}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 inline-flex text-xs font-bold rounded-full border ${priorityColors[task.priority] || ""}`}
                    >
                      {t(`priority.${task.priority}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-muted-foreground">
                      {task.assignee?.name || task.assignee?.email || t("unassigned")}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-muted-foreground">
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : t("noDueDate")}
                    </span>
                  </td>
                </tr>
              ))}
              {project.tasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {t("noTasks")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <StorageBreakdown title="Armazenamento no NAS — por tarefa" stats={taskStorage} />
      </div>

      {/* Artefatos: Projeto + Tarefas do projeto (Origem por linha) */}
      <div className="mt-6">
        <h2 className="text-xl font-bold text-foreground mb-4">{t("artifactsTable")}</h2>
        <UnifiedArtifactsPanel
          rows={artifactRows}
          scope="PROJECT"
          ownerIds={{ projectId: project.id }}
          canAdd
          canRemove
        />
      </div>
    </div>
  );
}
