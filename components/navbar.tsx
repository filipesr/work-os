import { auth } from "@/auth"
import { UserRole } from "@prisma/client"
import Link from "next/link"
import { signOutAction } from "@/lib/actions/auth"

export async function Navbar() {
  const session = await auth()

  if (!session?.user) {
    return null
  }

  const userRole = (session.user as any).role as UserRole

  return (
    <nav className="bg-card shadow-lg border-b-2 border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex space-x-8">
            <Link
              href="/"
              className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              Home
            </Link>

            {/* Admin Section - Manager or Admin */}
            {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
              <div className="flex space-x-8">
                <Link
                  href="/admin/clients"
                  className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                >
                  Admin
                </Link>
                <Link
                  href="/admin/projects"
                  className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
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
                  className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                >
                  Times
                </Link>
                <Link
                  href="/admin/users"
                  className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                >
                  Usuários
                </Link>
                <Link
                  href="/admin/templates"
                  className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
                >
                  Templates
                </Link>
              </div>
            )}

            {/* Reports Section - Manager or Admin */}
            {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
              <Link
                href="/reports"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                Relatórios
              </Link>
            )}

            {/* Tasks - Everyone */}
            <Link
              href="/admin/tasks"
              className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              Tarefas
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/account"
              className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            >
              {session.user.name} ({userRole})
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-sm font-semibold text-foreground hover:text-destructive transition-colors"
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
