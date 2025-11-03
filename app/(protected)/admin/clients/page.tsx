import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"

async function getClients() {
  return await prisma.client.findMany({
    include: {
      _count: {
        select: { projects: true },
      },
    },
    orderBy: { name: "asc" },
  })
}

async function createClient(formData: FormData) {
  "use server"
  const name = formData.get("name") as string
  if (!name) return

  await prisma.client.create({
    data: { name },
  })

  revalidatePath("/admin/clients")
}

async function updateClient(formData: FormData) {
  "use server"
  const id = formData.get("id") as string
  const name = formData.get("name") as string
  if (!id || !name) return

  await prisma.client.update({
    where: { id },
    data: { name },
  })

  revalidatePath("/admin/clients")
}

async function deleteClient(formData: FormData) {
  "use server"
  const id = formData.get("id") as string
  if (!id) return

  await prisma.client.delete({
    where: { id },
  })

  revalidatePath("/admin/clients")
}

export default async function ClientsPage() {
  const clients = await getClients()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage clients and their projects
        </p>
      </div>

      {/* Create Form */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Create Client</h2>
        <form action={createClient} className="flex gap-4">
          <input
            type="text"
            name="name"
            placeholder="Client name"
            required
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-2 border"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Create
          </button>
        </form>
      </div>

      {/* Clients List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Projects
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {clients.map((client) => (
              <tr key={client.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {client.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
                    {client._count.projects} projects
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <form action={deleteClient} className="inline">
                    <input type="hidden" name="id" value={client.id} />
                    <button
                      type="submit"
                      className="text-red-600 hover:text-red-900"
                      onClick={(e) => {
                        if (!confirm("Are you sure you want to delete this client?")) {
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
            {clients.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                  No clients found. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
