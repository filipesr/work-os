import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { UserRole } from "@prisma/client"
import EditUserButton from "./edit-user-button"
import { requireAdmin } from "@/lib/permissions"
import { getProxiedImageUrl } from "@/lib/utils/image-proxy"
import { getTranslations } from "next-intl/server"

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

  // ✅ VALIDATION: Check if user has active stages when changing teams
  const activeStages = await prisma.taskActiveStage.findMany({
    where: {
      assigneeId: id,
      status: "ACTIVE",
    },
    select: { id: true },
  })

  // If changing team and has active stages, automatically unassign them
  if (activeStages.length > 0) {
    await prisma.taskActiveStage.updateMany({
      where: {
        assigneeId: id,
        status: "ACTIVE",
      },
      data: { assigneeId: null }, // ✅ Desatribui etapas ativas automaticamente
    })

    // Also update task status if needed
    const affectedTasks = await prisma.taskActiveStage.findMany({
      where: {
        assigneeId: null,
        status: "ACTIVE",
      },
      select: { taskId: true },
      distinct: ["taskId"],
    })

    // Set tasks back to BACKLOG if they have no more assigned stages
    for (const stage of affectedTasks) {
      const remainingAssigned = await prisma.taskActiveStage.count({
        where: {
          taskId: stage.taskId,
          assigneeId: { not: null },
          status: "ACTIVE",
        },
      })

      if (remainingAssigned === 0) {
        await prisma.task.update({
          where: { id: stage.taskId },
          data: { status: "BACKLOG" },
        })
      }
    }
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
  const t = await getTranslations("admin.users")

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Users List */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.user")}
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.email")}
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.role")}
              </th>
              <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.team")}
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-foreground uppercase tracking-wider">
                {t("table.actions")}
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
                      {user.name || t("noName")}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-muted-foreground">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-3 py-1 inline-flex text-xs font-bold rounded-full bg-primary/10 text-primary border border-primary/20">
                    {t(`roles.${user.role.toLowerCase()}`)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-muted-foreground">
                    {user.team?.name || t("noTeam")}
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
                  {t("noUsers")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
