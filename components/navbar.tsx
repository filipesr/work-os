import { auth } from "@/auth"
import { UserRole } from "@prisma/client"
import Link from "next/link"
import { UserMenu } from "@/components/user-menu"

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
              href="/dashboard"
              className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              Dashboard
            </Link>

            {/* Tasks - Everyone */}
            <Link
              href="/admin/tasks"
              className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              Tarefas
            </Link>

            {/* Reports Section - Manager or Admin */}
            {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
              <Link
                href="/reports"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                Relatórios
              </Link>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <UserMenu userName={session.user.name} userRole={userRole} />
          </div>
        </div>
      </div>
    </nav>
  )
}
