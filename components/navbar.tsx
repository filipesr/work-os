import { auth } from "@/auth"
import { UserRole } from "@prisma/client"
import Link from "next/link"
import { signOut } from "@/lib/auth"

export async function Navbar() {
  const session = await auth()

  if (!session?.user) {
    return null
  }

  const userRole = (session.user as any).role as UserRole

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex space-x-8">
            <Link
              href="/"
              className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700"
            >
              Home
            </Link>

            {/* Admin Section - Manager or Admin */}
            {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
              <div className="flex space-x-8">
                <Link
                  href="/admin/clients"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700"
                >
                  Admin
                </Link>
                <Link
                  href="/admin/projects"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700"
                >
                  Projetos
                </Link>
              </div>
            )}

            {/* Admin Only Links */}
            {userRole === UserRole.ADMIN && (
              <div className="flex space-x-8">
                <Link
                  href="/admin/teams"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700"
                >
                  Times
                </Link>
                <Link
                  href="/admin/users"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700"
                >
                  Usuários
                </Link>
                <Link
                  href="/admin/templates"
                  className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700"
                >
                  Templates
                </Link>
              </div>
            )}

            {/* Reports Section - Manager or Admin */}
            {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
              <Link
                href="/reports"
                className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700"
              >
                Relatórios
              </Link>
            )}

            {/* Tasks - Everyone */}
            <Link
              href="/admin/tasks"
              className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700"
            >
              Tarefas
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">
              {session.user.name} ({userRole})
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </div>
    </nav>
  )
}
