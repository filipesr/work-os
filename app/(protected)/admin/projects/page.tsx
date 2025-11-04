import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { requireManagerOrAdmin } from "@/lib/permissions"
import { DeleteProjectButton } from "./delete-project-button"

async function getProjects() {
  await requireManagerOrAdmin()
  return await prisma.project.findMany({
    include: {
      client: true,
      _count: {
        select: { tasks: true },
      },
    },
    orderBy: { name: "asc" },
  })
}

async function getClients() {
  await requireManagerOrAdmin()
  return await prisma.client.findMany({
    orderBy: { name: "asc" },
  })
}

async function createProject(formData: FormData) {
  "use server"
  await requireManagerOrAdmin()
  const name = formData.get("name") as string
  const clientId = formData.get("clientId") as string
  if (!name || !clientId) return

  await prisma.project.create({
    data: { name, clientId },
  })

  revalidatePath("/admin/projects")
}

async function updateProject(formData: FormData) {
  "use server"
  await requireManagerOrAdmin()
  const id = formData.get("id") as string
  const name = formData.get("name") as string
  const clientId = formData.get("clientId") as string
  if (!id || !name || !clientId) return

  await prisma.project.update({
    where: { id },
    data: { name, clientId },
  })

  revalidatePath("/admin/projects")
}

async function deleteProject(formData: FormData) {
  "use server"
  await requireManagerOrAdmin()
  const id = formData.get("id") as string
  if (!id) return

  await prisma.project.delete({
    where: { id },
  })

  revalidatePath("/admin/projects")
}

export default async function ProjectsPage() {
  const [projects, clients] = await Promise.all([getProjects(), getClients()])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Projects</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage projects and their clients
        </p>
      </div>

      {/* Create Form */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Create Project
        </h2>
        <form action={createProject} className="flex gap-4">
          <input
            type="text"
            name="name"
            placeholder="Project name"
            required
            className="flex-1 h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
          />
          <select
            name="clientId"
            required
            className="h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
          >
            <option value="">Select Client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/10 shadow-sm hover:shadow-md transition-all duration-200"
          >
            Create
          </button>
        </form>
      </div>

      {/* Projects List */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                Tasks
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {projects.map((project) => (
              <tr key={project.id} className="hover:bg-accent transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-semibold text-foreground">
                    {project.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-muted-foreground">
                    {project.client.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-muted-foreground">
                    {project._count.tasks} tasks
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <DeleteProjectButton projectId={project.id} deleteAction={deleteProject} />
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-8 text-center text-sm text-muted-foreground"
                >
                  No projects found. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
