import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { computeProjectCompletion } from "@/lib/project-status";
import { EditProjectHeader } from "./edit-project-header";
import { ProjectArtifactsTable } from "@/components/admin/ProjectArtifactsTable";
import { ScopedArtifactsManager } from "@/components/admin/ScopedArtifactsManager";

const COMPLETION_STATE_LABEL: Record<string, string> = {
  empty: "Sem tarefas",
  pending: "Pendente",
  completed: "Concluído",
};

// Campaign metadata + nasUploadEnabled lock once any NAS artifact exists for the project.
async function isProjectNasLocked(projectId: string): Promise<boolean> {
  const count = await prisma.taskArtifact.count({
    where: { storageKind: "NAS_UPLOAD", task: { projectId } },
  });
  return count > 0;
}

// Save NAS campaign metadata + the upload-enabled toggle (MANAGER+). Enabling requires the campaign
// fields (slug/ano/mês) to be present; reviewing stamps who/when.
async function saveNasMetadata(formData: FormData) {
  "use server";
  const user = await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  const slug = ((formData.get("campaignSlug") as string) ?? "").trim();
  const year = parseInt((formData.get("campaignYear") as string) ?? "", 10);
  const month = parseInt((formData.get("campaignMonth") as string) ?? "", 10);
  const enable = formData.get("nasUploadEnabled") === "on";

  const locked = await isProjectNasLocked(id);
  const data: {
    campaignSlug?: string | null;
    campaignYear?: number | null;
    campaignMonth?: number | null;
    nasUploadEnabled?: boolean;
    nasMetadataReviewedAt?: Date | null;
    nasMetadataReviewedById?: string | null;
  } = {};

  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100;
  const validMonth = Number.isInteger(month) && month >= 1 && month <= 12;

  if (!locked) {
    data.campaignSlug = slug || null;
    data.campaignYear = validYear ? year : null;
    data.campaignMonth = validMonth ? month : null;
  }

  const complete = locked || (Boolean(slug) && validYear && validMonth);
  if (enable && complete) {
    data.nasUploadEnabled = true;
    data.nasMetadataReviewedAt = new Date();
    data.nasMetadataReviewedById = user.id as string;
  } else {
    data.nasUploadEnabled = false;
  }

  await prisma.project.update({ where: { id }, data });
  revalidatePath(`/admin/projects/${id}`);
}

async function getProject(projectId: string) {
  await requireManagerOrAdmin();
  return await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      artifacts: {
        where: { scope: "PROJECT" },
        select: { id: true, title: true, url: true },
        orderBy: { createdAt: "desc" },
      },
      tasks: {
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          artifacts: {
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

  const nasLocked = await isProjectNasLocked(projectId);

  const statusCounts = project.tasks.reduce(
    (acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Derived completion (% + state) from task statuses — single source of truth.
  const completion = computeProjectCompletion(project.tasks);

  // All artifacts across the project's tasks (flattened for the searchable table).
  const artifacts = project.tasks.flatMap((task) =>
    task.artifacts.map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      type: a.type,
      createdAt: a.createdAt.toISOString(),
      taskId: task.id,
      taskTitle: task.title,
      userName: a.user.name || a.user.email || "—",
    }))
  );

  const statusColors: Record<string, string> = {
    BACKLOG: "bg-gray-100 text-gray-800 border-gray-200",
    IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-200",
    COMPLETED: "bg-green-100 text-green-800 border-green-200",
    CANCELLED: "bg-red-100 text-red-800 border-red-200",
    PAUSED: "bg-yellow-100 text-yellow-800 border-yellow-200",
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

      {/* NAS — metadados de campanha + habilitar upload */}
      <div className="mt-6 bg-card shadow-lg rounded-xl border-2 border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">Armazenamento no NAS</h2>
          <span
            className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${
              project.nasUploadEnabled
                ? "bg-green-100 text-green-800 border-green-200"
                : "bg-muted text-muted-foreground border-border"
            }`}
          >
            {project.nasUploadEnabled ? "Upload habilitado" : "Upload desabilitado"}
          </span>
        </div>
        <form action={saveNasMetadata} className="space-y-4">
          <input type="hidden" name="id" value={project.id} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="campaignSlug"
                className="block text-sm font-semibold text-foreground mb-2"
              >
                Campanha (slug)
              </label>
              <input
                type="text"
                id="campaignSlug"
                name="campaignSlug"
                defaultValue={project.campaignSlug ?? ""}
                disabled={nasLocked}
                placeholder="ex.: Black Friday"
                className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all disabled:opacity-60"
              />
            </div>
            <div>
              <label
                htmlFor="campaignYear"
                className="block text-sm font-semibold text-foreground mb-2"
              >
                Ano de veiculação
              </label>
              <input
                type="number"
                id="campaignYear"
                name="campaignYear"
                min={2000}
                max={2100}
                defaultValue={project.campaignYear ?? ""}
                disabled={nasLocked}
                className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all disabled:opacity-60"
              />
            </div>
            <div>
              <label
                htmlFor="campaignMonth"
                className="block text-sm font-semibold text-foreground mb-2"
              >
                Mês de veiculação
              </label>
              <input
                type="number"
                id="campaignMonth"
                name="campaignMonth"
                min={1}
                max={12}
                defaultValue={project.campaignMonth ?? ""}
                disabled={nasLocked}
                className="h-11 w-full rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 outline-none transition-all disabled:opacity-60"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              name="nasUploadEnabled"
              defaultChecked={project.nasUploadEnabled}
              className="h-4 w-4 rounded border-2 border-input-border"
            />
            Habilitar upload no NAS para este projeto (exige campanha preenchida)
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-all shadow-sm"
            >
              Salvar NAS
            </button>
            {nasLocked && (
              <span className="text-xs text-muted-foreground">
                Campanha travada — já há arquivos no NAS.
              </span>
            )}
            {project.nasMetadataReviewedAt && (
              <span className="text-xs text-muted-foreground">
                Revisado em {project.nasMetadataReviewedAt.toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        </form>
      </div>

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
          <p className="text-3xl font-bold text-foreground mt-1">{artifacts.length}</p>
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

      {/* Project reference artifacts (scope PROJECT) — visíveis nas demandas do projeto */}
      <div className="mt-6">
        <ScopedArtifactsManager
          scope="PROJECT"
          ownerId={project.id}
          artifacts={project.artifacts}
        />
      </div>

      {/* Artifacts Table (searchable) */}
      <div className="mt-6">
        <h2 className="text-xl font-bold text-foreground mb-4">{t("artifactsTable")}</h2>
        <ProjectArtifactsTable artifacts={artifacts} />
      </div>
    </div>
  );
}
