import { redirect } from "next/navigation"
import { requireManagerOrAdmin } from "@/lib/permissions"
import { getTranslations } from "next-intl/server"

export default async function ReportsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  try {
    await requireManagerOrAdmin()
  } catch (error) {
    redirect("/dashboard")
  }

  const t = await getTranslations("reportsNavigation")

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-card shadow-lg border-b-2 border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex space-x-8">
              <a
                href="/reports/productivity"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                {t("productivity")}
              </a>
              <a
                href="/reports/performance"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                {t("performance")}
              </a>
              <a
                href="/reports/live-activity"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                {t("liveActivity")}
              </a>
            </div>
            <div className="flex items-center">
              <a
                href="/dashboard"
                className="text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                {t("backToDashboard")}
              </a>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
