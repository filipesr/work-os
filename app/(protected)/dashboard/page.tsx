import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskStatus, TaskPriority, ActiveStageStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimActiveStageButton } from "@/components/tasks/ClaimActiveStageButton";
import { UnassignActiveStageButton } from "@/components/tasks/UnassignActiveStageButton";
import { getMyActiveStages, getTeamBacklog } from "@/lib/actions/task";

// Types for our task active stage data
type ActiveStageWithDetails = {
  id: string;
  status: ActiveStageStatus;
  taskId: string;
  stageId: string;
  assigneeId: string | null;
  activatedAt: Date;
  completedAt: Date | null;
  task: {
    id: string;
    title: string;
    priority: TaskPriority;
    status: TaskStatus;
    dueDate: Date | null;
    createdAt: Date;
    project: {
      name: string;
    };
  };
  stage: {
    id: string;
    name: string;
    order: number;
    defaultTeam: {
      id: string;
      name: string;
    } | null;
    template: {
      id: string;
      name: string;
    };
  };
  assignee?: {
    name: string | null;
    email: string | null;
  } | null;
};

// User statistics type
type UserStats = {
  activeTasks: number;
  completedThisWeek: number;
  hoursLoggedToday: number;
  upcomingDeadlines: number;
};

// Priority badge component
function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const styles = {
    URGENT: "bg-red-100 text-red-800 border-red-300",
    HIGH: "bg-orange-100 text-orange-800 border-orange-300",
    MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
    LOW: "bg-green-100 text-green-800 border-green-300",
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-md border ${styles[priority]}`}>
      {priority}
    </span>
  );
}

// Status badge component
function StatusBadge({ status }: { status: TaskStatus }) {
  const styles = {
    BACKLOG: "bg-gray-100 text-gray-800 border-gray-300",
    IN_PROGRESS: "bg-blue-100 text-blue-800 border-blue-300",
    PAUSED: "bg-purple-100 text-purple-800 border-purple-300",
    COMPLETED: "bg-green-100 text-green-800 border-green-300",
    CANCELLED: "bg-red-100 text-red-800 border-red-300",
  };

  const labels = {
    BACKLOG: "Backlog",
    IN_PROGRESS: "Em Progresso",
    PAUSED: "Pausado",
    COMPLETED: "Concluído",
    CANCELLED: "Cancelado",
  };

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-md border ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// Format date helper
function formatDate(date: Date | null): string {
  if (!date) return "Sem prazo";

  const now = new Date();
  const taskDate = new Date(date);
  const diffTime = taskDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `Atrasado (${Math.abs(diffDays)}d)`;
  } else if (diffDays === 0) {
    return "Hoje";
  } else if (diffDays === 1) {
    return "Amanhã";
  } else if (diffDays <= 7) {
    return `Em ${diffDays} dias`;
  }

  return taskDate.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Stats Card Component
function StatsCard({ stats }: { stats: UserStats }) {
  return (
    <div className="grid grid-cols-4 gap-4 mb-8">
      <div className="bg-card p-4 rounded-lg border shadow-sm">
        <p className="text-sm text-muted-foreground mb-1">Tarefas Ativas</p>
        <p className="text-3xl font-bold text-foreground">{stats.activeTasks}</p>
      </div>
      <div className="bg-card p-4 rounded-lg border shadow-sm">
        <p className="text-sm text-muted-foreground mb-1">Concluídas (Semana)</p>
        <p className="text-3xl font-bold text-green-600">{stats.completedThisWeek}</p>
      </div>
      <div className="bg-card p-4 rounded-lg border shadow-sm">
        <p className="text-sm text-muted-foreground mb-1">Horas (Hoje)</p>
        <p className="text-3xl font-bold text-blue-600">{stats.hoursLoggedToday.toFixed(1)}h</p>
      </div>
      <div className="bg-card p-4 rounded-lg border shadow-sm">
        <p className="text-sm text-muted-foreground mb-1">Prazos Próximos</p>
        <p className="text-3xl font-bold text-orange-600">{stats.upcomingDeadlines}</p>
      </div>
    </div>
  );
}

// Active stage row component with visual urgency indicators
function ActiveStageRow({
  activeStage,
  showClaimButton = false,
  showUnassignButton = false
}: {
  activeStage: ActiveStageWithDetails;
  showClaimButton?: boolean;
  showUnassignButton?: boolean;
}) {
  const task = activeStage.task;
  const stage = activeStage.stage;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const isDueSoon = task.dueDate && !isOverdue &&
    new Date(task.dueDate).getTime() - Date.now() < 2 * 24 * 60 * 60 * 1000; // 2 days
  const isNew = Date.now() - new Date(task.createdAt).getTime() < 24 * 60 * 60 * 1000; // 24 hours
  const isBlocked = activeStage.status === "BLOCKED";

  return (
    <tr className={`
      hover:bg-muted/50 transition-colors border-b border-border
      ${isOverdue ? 'bg-red-50 dark:bg-red-950/20' : ''}
      ${isDueSoon && !isOverdue ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''}
      ${isBlocked ? 'bg-gray-50 dark:bg-gray-950/20' : ''}
    `}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {isOverdue && <span title="Tarefa atrasada" className="text-base">🔥</span>}
          {isDueSoon && !isOverdue && <span title="Prazo próximo" className="text-base">⚠️</span>}
          {isBlocked && <span title="Etapa bloqueada" className="text-base">🔒</span>}
          <Link
            href={`/tasks/${task.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            {task.title}
          </Link>
          {isNew && (
            <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded dark:bg-blue-900 dark:text-blue-200">
              NOVO
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-muted-foreground">{task.project.name}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            {stage.order}
          </span>
          <span className="text-sm text-muted-foreground">
            {stage.name}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <PriorityBadge priority={task.priority} />
      </td>
      <td className="px-4 py-3">
        {isBlocked ? (
          <span className="px-2 py-1 text-xs font-medium rounded-md border bg-gray-100 text-gray-800 border-gray-300">
            Bloqueado
          </span>
        ) : (
          <StatusBadge status={task.status} />
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`text-sm ${isOverdue ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
          {formatDate(task.dueDate)}
        </span>
      </td>
      {showClaimButton && (
        <td className="px-4 py-3">
          <ClaimActiveStageButton
            taskId={task.id}
            stageId={stage.id}
            isBlocked={isBlocked}
          />
        </td>
      )}
      {showUnassignButton && (
        <td className="px-4 py-3">
          <UnassignActiveStageButton
            taskId={task.id}
            stageId={stage.id}
            currentAssignee={activeStage.assignee?.name || activeStage.assignee?.email || null}
          />
        </td>
      )}
    </tr>
  );
}

// Empty state component
function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

// ActiveStageList component
function ActiveStageList({
  activeStages,
  title,
  showClaimButton = false,
  showUnassignButton = false
}: {
  activeStages: ActiveStageWithDetails[];
  title: string;
  showClaimButton?: boolean;
  showUnassignButton?: boolean;
}) {
  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
      {/* Header */}
      <div className="bg-primary/5 px-6 py-4 border-b-2 border-border">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {activeStages.length} {activeStages.length === 1 ? "etapa ativa" : "etapas ativas"}
        </p>
      </div>

      {/* Table or Empty State */}
      {activeStages.length === 0 ? (
        <EmptyState
          message={
            title.includes("Ativas")
              ? "Você não tem etapas ativas. Bom trabalho!"
              : "O backlog da sua equipe está limpo."
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Tarefa
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Projeto
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Etapa Atual
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Prioridade
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Data de Entrega
                </th>
                {(showClaimButton || showUnassignButton) && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Ação
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {activeStages.map((activeStage) => (
                <ActiveStageRow
                  key={activeStage.id}
                  activeStage={activeStage}
                  showClaimButton={showClaimButton}
                  showUnassignButton={showUnassignButton}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Main Dashboard Page Component
export default async function DashboardPage() {
  const session = await auth();

  // Redirect if not authenticated
  if (!session?.user) {
    return notFound();
  }

  // @ts-ignore - Custom session fields
  const userId = session.user.id;

  // 🔥 FIX CRÍTICO: Buscar teamId atual do banco de dados
  // Resolve problema de sessão desatualizada quando admin adiciona usuário ao time
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { teamId: true }
  });
  const teamId = currentUser?.teamId;

  // Validação: usuário sem time atribuído
  if (!teamId) {
    return (
      <div className="container mx-auto py-6 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Olá, {session.user.name?.split(" ")[0] || "Usuário"}!
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você ainda não foi atribuído a um time.
          </p>
        </div>
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded dark:bg-yellow-950/20">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-xl">⚠️</span>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700 dark:text-yellow-200">
                <strong>Aguardando configuração:</strong> Entre em contato com o administrador para ter acesso às tarefas da sua equipe.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Parallel data fetching for widgets and statistics
  const [myActiveStages, teamBacklogStages, stats] = await Promise.all([
    // Query 1: "Minhas Etapas Ativas"
    // Fetches active stages *assigned to me*
    getMyActiveStages(),

    // Query 2: "Backlog da Minha Equipe"
    // Fetches active stages for *my team* that are *unassigned*
    getTeamBacklog(teamId),

    // Query 3: User Statistics (updated for TaskActiveStage)
    prisma.$transaction(async (tx) => {
      const now = new Date();
      const startOfToday = new Date(now.setHours(0, 0, 0, 0));
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const [activeTasks, completedThisWeek, hoursResult, upcomingDeadlines] = await Promise.all([
        // Count my active stages
        tx.taskActiveStage.count({
          where: {
            assigneeId: userId,
            status: "ACTIVE"
          }
        }),
        // Count stages I completed this week
        tx.taskActiveStage.count({
          where: {
            assigneeId: userId,
            status: "COMPLETED",
            completedAt: { gte: weekAgo }
          }
        }),
        // Hours logged today (unchanged)
        tx.timeLog.aggregate({
          where: {
            userId,
            logDate: { gte: startOfToday }
          },
          _sum: { hoursSpent: true }
        }),
        // Upcoming deadlines - count tasks with my active stages that have deadlines
        tx.taskActiveStage.count({
          where: {
            assigneeId: userId,
            status: "ACTIVE",
            task: {
              dueDate: {
                lte: threeDaysFromNow,
                gte: now
              }
            }
          }
        })
      ]);

      return {
        activeTasks,
        completedThisWeek,
        hoursLoggedToday: hoursResult._sum.hoursSpent || 0,
        upcomingDeadlines
      };
    })
  ]);

  return (
    <div className="container mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-foreground">
          Olá, {session.user.name?.split(" ")[0] || "Usuário"}!
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Aqui está o que você precisa fazer hoje.
        </p>
      </div>

      {/* Statistics Cards */}
      <StatsCard stats={stats} />

      {/* Dashboard Widgets */}
      <div className="space-y-8">
        {/* Widget 1: My Active Stages - Com botão "Liberar Etapa" */}
        <ActiveStageList activeStages={myActiveStages} title="Minhas Etapas Ativas" showUnassignButton={true} />

        {/* Widget 2: Team Backlog - Com botão "Pegar Etapa" */}
        <ActiveStageList activeStages={teamBacklogStages} title="Backlog da Equipe (Não Atribuído)" showClaimButton={true} />
      </div>
    </div>
  );
}
