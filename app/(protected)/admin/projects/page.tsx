import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { requireManagerOrAdmin } from "@/lib/permissions"

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
        <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage projects and their clients
        </p>
      </div>

      {/* Create Form */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Create Project
        </h2>
        <form action={createProject} className="flex gap-4">
          <input
            type="text"
            name="name"
            placeholder="Project name"
            required
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-2 border"
          />
          <select
            name="clientId"
            required
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-2 border"
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
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Create
          </button>
        </form>
      </div>

      {/* Projects List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tasks
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {projects.map((project) => (
              <tr key={project.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {project.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
                    {project.client.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
                    {project._count.tasks} tasks
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <form action={deleteProject} className="inline">
                    <input type="hidden" name="id" value={project.id} />
                    <button
                      type="submit"
                      className="text-red-600 hover:text-red-900"
                      onClick={(e) => {
                        if (
                          !confirm(
                            "Are you sure you want to delete this project?"
                          )
                        ) {
                          e.preventDefault()
                        }
                      }}
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {projects.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-4 text-center text-sm text-gray-500"
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
