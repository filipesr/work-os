import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { EditClientHeader } from "./edit-client-header";

async function getClient(clientId: string) {
  await requireManagerOrAdmin();
  return await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      projects: {
        include: { _count: { select: { tasks: true } } },
        orderBy: { name: "asc" },
      },
    },
  });
}

async function updateClient(formData: FormData) {
  "use server";
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const email = formData.get("email") as string;
  const phone = formData.get("phone") as string;
  if (!id || !name) return;

  await prisma.client.update({
    where: { id },
    data: {
      name,
      description: description || null,
      email: email || null,
      phone: phone || null,
    },
  });

  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin/clients");
}

async function deleteClient(formData: FormData) {
  "use server";
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  if (!id) return;

  await prisma.client.delete({
    where: { id },
  });

  revalidatePath("/admin/clients");
}

async function createClientProject(formData: FormData) {
  "use server";
  await requireManagerOrAdmin();
  const clientId = formData.get("clientId") as string;
  const name = formData.get("name") as string;
  if (!clientId || !name?.trim()) return;

  await prisma.project.create({
    data: { name: name.trim(), clientId },
  });

  revalidatePath(`/admin/clients/${clientId}`);
}

async function setProjectStatus(formData: FormData) {
  "use server";
  await requireManagerOrAdmin();
  const id = formData.get("id") as string;
  const clientId = formData.get("clientId") as string;
  const status = formData.get("status") as string;
  if (!id || (status !== "ACTIVE" && status !== "INACTIVE")) return;

  await prisma.project.update({
    where: { id },
    data: { status: status as "ACTIVE" | "INACTIVE" },
  });

  revalidatePath(`/admin/clients/${clientId}`);
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const [client, t] = await Promise.all([
    getClient(clientId),
    getTranslations("admin.clients.detail"),
  ]);

  if (!client) {
    notFound();
  }

  const totalTasks = client.projects.reduce((sum, p) => sum + p._count.tasks, 0);

  return (
    <div className="container mx-auto p-8">
      <Link
        href="/admin/clients"
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
        {t("backToClients")}
      </Link>

      {/* Header Card */}
      <EditClientHeader
        client={{
          id: client.id,
          name: client.name,
          description: client.description,
          email: client.email,
          phone: client.phone,
        }}
        updateClient={updateClient}
        deleteClient={deleteClient}
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
          <p className="text-sm text-muted-foreground">{t("totalProjects")}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{client.projects.length}</p>
        </div>
        <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
          <p className="text-sm text-muted-foreground">{t("totalTasks")}</p>
          <p className="text-3xl font-bold text-foreground mt-1">{totalTasks}</p>
        </div>
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

        <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
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
              {client.projects.map((project) => {
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
                            ? "bg-green-100 text-green-800 border-green-200"
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
                          {t("viewKanban")}
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
              {client.projects.length === 0 && (
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
