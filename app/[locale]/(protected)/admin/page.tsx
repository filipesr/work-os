import { prisma } from "@/lib/prisma"
import { TaskStatus } from "@prisma/client"
import Link from "next/link"
import { getTranslations } from "next-intl/server"

// StatCard Component
function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 hover:shadow-xl transition-shadow duration-200">
      <div className="flex flex-col items-center justify-center">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          {title}
        </h3>
        <p className="text-4xl font-bold text-primary">
          {value.toLocaleString()}
        </p>
      </div>
    </div>
  )
}

// Navigation Card Component
function NavCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="block bg-card shadow-lg rounded-xl border-2 border-border p-6 hover:border-primary hover:shadow-xl transition-all duration-200"
    >
      <h3 className="text-lg font-bold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Link>
  )
}

export default async function AdminDashboardPage() {
  const t = await getTranslations("admin.dashboard");

  // Fetch system statistics in parallel
  const [
    userCount,
    clientCount,
    projectCount,
    templateCount,
    activeTaskCount
  ] = await Promise.all([
    prisma.user.count(),
    prisma.client.count(),
    prisma.project.count(),
    prisma.workflowTemplate.count(),
    prisma.task.count({
      where: {
        status: { in: [TaskStatus.BACKLOG, TaskStatus.IN_PROGRESS, TaskStatus.PAUSED] }
      }
    })
  ])

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
        <StatCard title={t("stats.users")} value={userCount} />
        <StatCard title={t("stats.clients")} value={clientCount} />
        <StatCard title={t("stats.projects")} value={projectCount} />
        <StatCard title={t("stats.activeTasks")} value={activeTaskCount} />
        <StatCard title={t("stats.templates")} value={templateCount} />
      </div>

      {/* Navigation Hub */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-4">{t("nav.title")}</h2>
        <p className="text-sm text-muted-foreground mb-6">
          {t("nav.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <NavCard
          href="/admin/users"
          title={t("nav.users.title")}
          description={t("nav.users.description")}
        />
        <NavCard
          href="/admin/teams"
          title={t("nav.teams.title")}
          description={t("nav.teams.description")}
        />
        <NavCard
          href="/admin/clients"
          title={t("nav.clients.title")}
          description={t("nav.clients.description")}
        />
        <NavCard
          href="/admin/projects"
          title={t("nav.projects.title")}
          description={t("nav.projects.description")}
        />
        <NavCard
          href="/admin/templates"
          title={t("nav.templates.title")}
          description={t("nav.templates.description")}
        />
        <NavCard
          href="/admin/tasks"
          title={t("nav.tasks.title")}
          description={t("nav.tasks.description")}
        />
      </div>
    </div>
  )
}
