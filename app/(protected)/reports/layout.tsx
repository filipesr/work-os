import { redirect } from "next/navigation"
import { requireManagerOrAdmin } from "@/lib/permissions"

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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex space-x-8">
              <a
                href="/reports/productivity"
                className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700"
              >
                Produtividade
              </a>
              <a
                href="/reports/performance"
                className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700"
              >
                Gargalos
              </a>
              <a
                href="/reports/live-activity"
                className="inline-flex items-center px-1 pt-1 text-sm font-medium text-gray-900 hover:text-gray-700"
              >
                Atividade ao Vivo
              </a>
            </div>
            <div className="flex items-center">
              <a
                href="/dashboard"
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                ← Voltar ao Dashboard
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
