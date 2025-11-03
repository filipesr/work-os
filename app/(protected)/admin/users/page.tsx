import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { UserRole } from "@prisma/client"
import EditUserButton from "./edit-user-button"

async function getUsers() {
  return await prisma.user.findMany({
    include: {
      team: true,
    },
    orderBy: { email: "asc" },
  })
}

async function getTeams() {
  return await prisma.team.findMany({
    orderBy: { name: "asc" },
  })
}

async function updateUser(formData: FormData) {
  "use server"
  const id = formData.get("id") as string
  const role = formData.get("role") as UserRole
  const teamId = formData.get("teamId") as string | null
  if (!id || !role) return

  await prisma.user.update({
    where: { id },
    data: {
      role,
      teamId: teamId || null,
    },
  })

  revalidatePath("/admin/users")
}

export default async function UsersPage() {
  const [users, teams] = await Promise.all([getUsers(), getTeams()])

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Users</h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage users, their roles, and team assignments
        </p>
      </div>

      {/* Users List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Team
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    {user.image && (
                      <img
                        className="h-10 w-10 rounded-full mr-3"
                        src={user.image}
                        alt=""
                      />
                    )}
                    <div className="text-sm font-medium text-gray-900">
                      {user.name || "N/A"}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">{user.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-500">
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
                  className="px-6 py-4 text-center text-sm text-gray-500"
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
