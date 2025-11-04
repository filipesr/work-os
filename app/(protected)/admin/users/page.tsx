import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { UserRole } from "@prisma/client"
import EditUserButton from "./edit-user-button"
import { requireAdmin } from "@/lib/permissions"
import { getProxiedImageUrl } from "@/lib/utils/image-proxy"

async function getUsers() {
  await requireAdmin()
  return await prisma.user.findMany({
    include: {
      team: true,
    },
    orderBy: { email: "asc" },
  })
}

async function getTeams() {
  await requireAdmin()
  return await prisma.team.findMany({
    orderBy: { name: "asc" },
  })
}

async function updateUser(formData: FormData) {
  "use server"
  await requireAdmin()
  const id = formData.get("id") as string
  const role = formData.get("role") as UserRole
  const newTeamId = formData.get("teamId") as string | null
  if (!id || !role) return

  // ✅ VALIDATION: Check if user has active tasks when changing teams
  const activeTasks = await prisma.task.findMany({
    where: {
      assigneeId: id,
      status: { in: ["BACKLOG", "IN_PROGRESS", "PAUSED"] },
    },
    include: {
      currentStage: {
        select: { defaultTeamId: true },
      },
    },
  })

  // If changing team and has active tasks, automatically unassign them
  if (activeTasks.length > 0) {
    await prisma.task.updateMany({
      where: {
        assigneeId: id,
        status: { in: ["BACKLOG", "IN_PROGRESS", "PAUSED"] },
      },
      data: { assigneeId: null }, // ✅ Desatribui tarefas automaticamente
    })
  }

  await prisma.user.update({
    where: { id },
    data: {
      role,
      teamId: newTeamId || null,
    },
  })

  revalidatePath("/admin/users")
  revalidatePath("/dashboard") // ✅ Revalidate dashboard
}

export default async function UsersPage() {
  const [users, teams] = await Promise.all([getUsers(), getTeams()])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Users</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage users, their roles, and team assignments
        </p>
      </div>

      {/* Users List */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                Team
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-accent transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {user.image && (
                      <img
                        className="h-10 w-10 rounded-full mr-3 border-2 border-border"
                        src={getProxiedImageUrl(user.image) || undefined}
                        alt=""
                      />
                    )}
                    <div className="text-sm font-semibold text-foreground">
                      {user.name || "N/A"}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-muted-foreground">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-3 py-1 inline-flex text-xs font-bold rounded-full bg-primary/10 text-primary border border-primary/20">
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-muted-foreground">
                    {user.team?.name || "No team"}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <EditUserButton
                    user={user}
                    teams={teams}
                    updateUser={updateUser}
                  />
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-8 text-center text-sm text-muted-foreground"
                >
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
