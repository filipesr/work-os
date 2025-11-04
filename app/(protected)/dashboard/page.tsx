import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TaskStatus, TaskPriority } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

// Types for our task data
type TaskWithDetails = {
  id: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: Date | null;
  createdAt: Date;
  project: {
    name: string;
  };
  currentStage: {
    name: string;
  } | null;
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

// Task row component
function TaskRow({ task }: { task: TaskWithDetails }) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <tr className="hover:bg-muted/50 transition-colors border-b border-border">
      <td className="px-4 py-3">
        <Link
          href={`/tasks/${task.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          {task.title}
        </Link>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-muted-foreground">{task.project.name}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {task.currentStage?.name || "Sem etapa"}
        </span>
      </td>
      <td className="px-4 py-3">
        <PriorityBadge priority={task.priority} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={task.status} />
      </td>
      <td className="px-4 py-3">
        <span className={`text-sm ${isOverdue ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
          {formatDate(task.dueDate)}
        </span>
      </td>
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

// TaskList component
function TaskList({ tasks, title }: { tasks: TaskWithDetails[]; title: string }) {
  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
      {/* Header */}
      <div className="bg-primary/5 px-6 py-4 border-b-2 border-border">
        <h2 className="text-xl font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {tasks.length} {tasks.length === 1 ? "tarefa" : "tarefas"}
        </p>
      </div>

      {/* Table or Empty State */}
      {tasks.length === 0 ? (
        <EmptyState
          message={
            title.includes("Ativas")
              ? "Você não tem tarefas ativas. Bom trabalho!"
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
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
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
  // @ts-ignore - Custom session fields
  const teamId = session.user.teamId;

  // Parallel data fetching for both widgets
  const [myActiveTasks, teamBacklogTasks] = await Promise.all([
    // Query 1: "Minhas Tarefas Ativas"
    // Fetches tasks *assigned to me* that are not completed.
    prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: { in: [TaskStatus.BACKLOG, TaskStatus.IN_PROGRESS, TaskStatus.PAUSED] },
      },
      include: {
        project: { select: { name: true } },
        currentStage: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" }, // Prioritizes by due date
    }),

    // Query 2: "Backlog da Minha Equipe"
    // Fetches tasks assigned to *my team's current stage* but *unassigned* to anyone.
    prisma.task.findMany({
      where: {
        assigneeId: null, // Unassigned
        status: TaskStatus.BACKLOG,
        currentStage: {
          defaultTeamId: teamId, // In my team's queue
        },
      },
      include: {
        project: { select: { name: true } },
        currentStage: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" }, // Oldest first
    }),
  ]);

  return (
    <div className="container mx-auto py-6 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          Olá, {session.user.name?.split(" ")[0] || "Usuário"}!
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Aqui está o que você precisa fazer hoje.
        </p>
      </div>

      {/* Dashboard Widgets */}
      <div className="space-y-8">
        {/* Widget 1: My Active Tasks */}
        <TaskList tasks={myActiveTasks} title="Minhas Tarefas Ativas" />

        {/* Widget 2: Team Backlog */}
        <TaskList tasks={teamBacklogTasks} title="Backlog da Equipe (Não Atribuído)" />
      </div>
    </div>
  );
}
