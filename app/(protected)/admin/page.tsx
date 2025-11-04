import { prisma } from "@/lib/prisma"
import { TaskStatus } from "@prisma/client"
import Link from "next/link"

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
        <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Visão geral do sistema e gerenciamento administrativo
        </p>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-12">
        <StatCard title="Total de Usuários" value={userCount} />
        <StatCard title="Total de Clientes" value={clientCount} />
        <StatCard title="Total de Projetos" value={projectCount} />
        <StatCard title="Tarefas Ativas" value={activeTaskCount} />
        <StatCard title="Templates de Fluxo" value={templateCount} />
      </div>

      {/* Navigation Hub */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-4">Hub de Navegação</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Acesse rapidamente as páginas de gerenciamento administrativo
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <NavCard
          href="/admin/users"
          title="Gerenciar Usuários e Funções"
          description="Administre usuários, atribua funções e gerencie permissões do sistema"
        />
        <NavCard
          href="/admin/teams"
          title="Gerenciar Equipes"
          description="Crie e organize equipes, adicione membros e coordene projetos"
        />
        <NavCard
          href="/admin/clients"
          title="Gerenciar Clientes"
          description="Gerencie informações de clientes e mantenha relacionamentos"
        />
        <NavCard
          href="/admin/projects"
          title="Gerenciar Projetos"
          description="Supervisione todos os projetos, atribua equipes e acompanhe o progresso"
        />
        <NavCard
          href="/admin/templates"
          title="Gerenciar Fluxos de Trabalho"
          description="Crie e edite templates de workflow para padronizar processos"
        />
        <NavCard
          href="/admin/tasks"
          title="Gerenciar Tarefas"
          description="Visualize e administre todas as tarefas do sistema"
        />
      </div>
    </div>
  )
}
