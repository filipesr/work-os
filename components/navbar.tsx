import { auth } from "@/auth"
import { UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { UserMenu } from "@/components/user-menu"
import { getTranslations } from "next-intl/server"

export async function Navbar() {
  const session = await auth()

  if (!session?.user) {
    return null
  }

  const userRole = (session.user as any).role as UserRole
  const userId = (session.user as any).id
  const t = await getTranslations("common.nav")

  // Buscar teamId atualizado do banco
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamId: true }
  })
  const hasTeam = !!currentUser?.teamId
  const isAdminOrManager = userRole === UserRole.ADMIN || userRole === UserRole.MANAGER

  return (
    <nav className="bg-card shadow-lg border-b-2 border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex space-x-8">
            {/* Dashboard: Apenas para usuários COM team */}
            {hasTeam && (
              <Link
                href="/dashboard"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                {t("dashboard")}
              </Link>
            )}

            {/* Tarefas: Para admin/manager vai para /admin/tasks, para outros vai para /dashboard */}
            <Link
              href={isAdminOrManager ? "/admin/tasks" : "/dashboard"}
              className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              {t("tasks")}
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <UserMenu userName={session.user.name ?? null} userRole={userRole} />
          </div>
        </div>
      </div>
    </nav>
  )
}
