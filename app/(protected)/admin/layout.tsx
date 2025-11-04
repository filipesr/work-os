import { redirect } from "next/navigation"
import { requireManagerOrAdmin } from "@/lib/permissions"

export default async function AdminLayout({
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
    <div className="min-h-screen bg-background">
      <nav className="bg-card shadow-lg border-b-2 border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex space-x-8">
              <a
                href="/admin"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                Dashboard
              </a>
              <a
                href="/admin/teams"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                Teams
              </a>
              <a
                href="/admin/clients"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                Clients
              </a>
              <a
                href="/admin/projects"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                Projects
              </a>
              <a
                href="/admin/users"
                className="inline-flex items-center px-1 pt-1 text-sm font-semibold text-foreground hover:text-primary transition-colors"
              >
                Users
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
