import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { requireAdmin } from "@/lib/permissions"
import { DeleteTeamButton } from "./delete-team-button"

async function getTeams() {
  await requireAdmin()
  return await prisma.team.findMany({
    include: {
      _count: {
        select: { members: true },
      },
    },
    orderBy: { name: "asc" },
  })
}

async function createTeam(formData: FormData) {
  "use server"
  await requireAdmin()
  const name = formData.get("name") as string
  if (!name) return

  await prisma.team.create({
    data: { name },
  })

  revalidatePath("/admin/teams")
}

async function updateTeam(formData: FormData) {
  "use server"
  await requireAdmin()
  const id = formData.get("id") as string
  const name = formData.get("name") as string
  if (!id || !name) return

  await prisma.team.update({
    where: { id },
    data: { name },
  })

  revalidatePath("/admin/teams")
}

async function deleteTeam(formData: FormData) {
  "use server"
  await requireAdmin()
  const id = formData.get("id") as string
  if (!id) return

  await prisma.team.delete({
    where: { id },
  })

  revalidatePath("/admin/teams")
}

export default async function TeamsPage() {
  const teams = await getTeams()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Teams</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage teams and their members
        </p>
      </div>

      {/* Create Form */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Create Team</h2>
        <form action={createTeam} className="flex gap-4">
          <input
            type="text"
            name="name"
            placeholder="Team name"
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

      {/* Teams List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Members
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {teams.map((team) => (
              <tr key={team.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {team.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
                    {team._count.members} members
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <DeleteTeamButton teamId={team.id} deleteAction={deleteTeam} />
                </td>
              </tr>
            ))}
            {teams.length === 0 && (
              <tr>
                <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                  No teams found. Create one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
