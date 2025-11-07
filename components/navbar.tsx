import { auth } from "@/auth"
import { UserRole } from "@prisma/client"
import Link from "next/link"
import { UserMenu } from "@/components/user-menu"
import { getTranslations } from "next-intl/server"

export async function Navbar() {
  const session = await auth()

  if (!session?.user) {
    return null
  }

  const userRole = (session.user as any).role as UserRole
  const t = await getTranslations("common.nav")

  return (
    <nav className="bg-card shadow-lg border-b-2 border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex space-x-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              {t("dashboard")}
            </Link>

            <Link
              href="/admin/tasks"
              className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              {t("tasks")}
            </Link>

            {(userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) && (
              <Link
                href="/reports"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                {t("reports")}
              </Link>
            )}

            <Link
              href="/task-flow"
              className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
            >
              {t("taskFlow")}
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
