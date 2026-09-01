import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import { computeProjectCompletion } from "@/lib/project-status";
import { mapArtifactRow } from "@/lib/artifacts/unify";
import { UnifiedArtifactsPanel } from "@/components/artifacts/UnifiedArtifactsPanel";
import { StorageBreakdown } from "@/components/nas/StorageBreakdown";
import { storageByProject } from "@/lib/nas/storage-stats";
import { BackLink } from "@/components/ui/BackLink";
import { StatCard } from "@/components/admin/StatCard";
import {
  isClientFolderLocked,
  updateClient,
  deleteClient,
  createClientProject,
  setProjectStatus,
} from "@/lib/actions/client";
import { EditClientHeader } from "./edit-client-header";
import { ProjectStatusFilter } from "./project-status-filter";

async function getClient(clientId: string) {
  await requireManagerOrAdmin();
  return await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      artifacts: {
        where: { scope: "CLIENT", isCurrent: true },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      projects: {
        include: {
          tasks: { select: { status: true } },
          _count: { select: { tasks: true } },
        },
        orderBy: { name: "asc" },
      },
    },
  });
}

// Allow-list para o filtro de conclusão (espelha o pick() de admin/tasks/page).
const COMPLETION_FILTERS = ["pending", "completed"] as const;
type CompletionFilter = (typeof COMPLETION_FILTERS)[number];

function pickCompletion(value: string | string[] | undefined): CompletionFilter | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single && (COMPLETION_FILTERS as readonly string[]).includes(single)
    ? (single as CompletionFilter)
    : undefined;
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { clientId } = await params;
  const [client, sp, t] = await Promise.all([
    getClient(clientId),
    searchParams,
    getTranslations("admin.clients.detail"),
  ]);

  if (!client) {
    notFound();
  }

  const folderNameLocked = await isClientFolderLocked(clientId);

  const totalTasks = client.projects.reduce((sum, p) => sum + p._count.tasks, 0);
  const projectStorage = await storageByProject(clientId);

  // Classifica cada projeto pelo estado derivado e aplica o filtro (se válido).
  const statusFilter = pickCompletion(sp.status);
  const visibleProjects = client.projects.filter((project) => {
    if (!statusFilter) return true;
    const { state } = computeProjectCompletion(project.tasks);
    return state === statusFilter;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <BackLink href="/admin/clients" label={t("backToClients")} className="mb-6" />

      {/* Header Card */}
      <EditClientHeader
        client={{
          id: client.id,
          name: client.name,
          description: client.description,
          email: client.email,
          phone: client.phone,
          folderName: client.folderName,
        }}
        folderNameLocked={folderNameLocked}
        updateClient={updateClient}
        deleteClient={deleteClient}
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <StatCard label={t("totalProjects")} value={client.projects.length} />
        <StatCard label={t("totalTasks")} value={totalTasks} />
      </div>

      <div className="mt-6">
        <StorageBreakdown title={t("storageByProject")} stats={projectStorage} />
      </div>

      {/* Artefatos do cliente (Origem: Cliente) — visíveis nas demandas do cliente */}
      <div className="mt-6">
        <h2 className="text-xl font-bold text-foreground mb-4">{t("artifacts")}</h2>
        <UnifiedArtifactsPanel
          rows={client.artifacts.map((a) => mapArtifactRow(a, "CLIENT"))}
          scope="CLIENT"
          ownerIds={{ clientId: client.id }}
          canAdd
          canRemove
        />
      </div>

      {/* Projects Table */}
      <div className="mt-6">
        <h2 className="text-xl font-bold text-foreground mb-4">{t("projectsTable")}</h2>

        {/* Create project */}
        <form
          action={createClientProject}
          className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center"
        >
          <input type="hidden" name="clientId" value={client.id} />
          <input
            type="text"
            name="name"
            required
            placeholder={t("projectNamePlaceholder")}
            className="h-11 flex-1 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base font-medium text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 transition-all"
          />
          <button
            type="submit"
            className="h-11 rounded-lg bg-primary px-6 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
          >
            {t("createProjectButton")}
          </button>
        </form>

        {/* Completion filter chips (Pendentes / Concluídos / Todos) */}
        <ProjectStatusFilter />

        <div className="bg-card shadow-lg rounded-xl border border-border overflow-hidden">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("projectName")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("statusColumn")}
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("taskCount")}
                </th>
                <th className="px-6 py-4 text-right text-xs font-bold text-foreground uppercase tracking-wider">
                  {t("projectActions")}
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {visibleProjects.map((project) => {
                const isActive = project.status === "ACTIVE";
                return (
                  <tr
                    key={project.id}
                    className={`hover:bg-accent transition-colors ${isActive ? "" : "opacity-60"}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/admin/projects/${project.id}`}
                        className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${
                          isActive
                            ? "bg-success-subtle text-success border-success/40"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {isActive ? t("statusActive") : t("statusInactive")}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-muted-foreground">{project._count.tasks}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-4">
                        <Link
                          href={`/projects/${project.id}`}
                          className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                          {t("viewTimeline")}
                        </Link>
                        <form action={setProjectStatus}>
                          <input type="hidden" name="id" value={project.id} />
                          <input type="hidden" name="clientId" value={client.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={isActive ? "INACTIVE" : "ACTIVE"}
                          />
                          <button
                            type="submit"
                            className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {isActive ? t("deactivate") : t("activate")}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleProjects.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">
                    {t("noProjects")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
