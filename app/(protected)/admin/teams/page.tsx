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
        <h1 className="text-3xl font-bold text-foreground">Teams</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage teams and their members
        </p>
      </div>

      {/* Create Form */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4">Create Team</h2>
        <form action={createTeam} className="flex gap-4">
          <input
            type="text"
            name="name"
            placeholder="Team name"
            required
            className="flex-1 h-11 rounded-lg border-2 border-input-border bg-input px-4 py-2.5 text-base text-foreground font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 transition-all duration-200"
          />
          <button
            type="submit"
            className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/10 shadow-sm hover:shadow-md transition-all duration-200"
          >
            Create
          </button>
        </form>
      </div>

      {/* Teams List */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                Members
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {teams.map((team) => (
              <tr key={team.id} className="hover:bg-accent transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-semibold text-foreground">
                    {team.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-muted-foreground">
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
                <td colSpan={3} className="px-6 py-8 text-center text-sm text-muted-foreground">
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
