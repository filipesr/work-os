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
    <div className="min-h-screen bg-background">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
