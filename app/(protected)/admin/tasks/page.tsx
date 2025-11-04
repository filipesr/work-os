import Link from "next/link";
import { getTasks } from "@/lib/actions/task";

export default async function TasksPage() {
  const tasks = await getTasks();

  return (
    <div className="container mx-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage and track all tasks across projects
          </p>
        </div>
        <Link
          href="/admin/tasks/new"
          className="px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-sm hover:shadow-md transition-all duration-200"
        >
          + Create Task
        </Link>
      </div>

      {/* Tasks List */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
        {tasks.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-muted-foreground mb-6">
              <svg
                className="mx-auto h-16 w-16"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-foreground mb-3">No tasks yet</h3>
            <p className="text-muted-foreground mb-6">
              Get started by creating your first task from a workflow template.
            </p>
            <Link
              href="/admin/tasks/new"
              className="inline-flex items-center px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-sm hover:shadow-md transition-all duration-200"
            >
              Create your first task
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  Task
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  Project
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  Current Stage
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  Assignee
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-foreground uppercase tracking-wider">
                  Due Date
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {tasks.map((task: any) => (
                <tr key={task.id} className="hover:bg-accent transition-colors">
                  <td className="px-6 py-4">
                    <Link
                      href={`/admin/tasks/${task.id}`}
                      className="text-primary hover:text-primary/80 font-semibold transition-colors"
                    >
                      {task.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {task.project.client.name} - {task.project.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 text-xs font-bold rounded-full ${
                        task.status === "DONE"
                          ? "bg-green-100 text-green-800 border border-green-200"
                          : task.status === "IN_PROGRESS"
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : task.status === "BLOCKED"
                          ? "bg-destructive/10 text-destructive border border-destructive/20"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {task.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {task.currentStage?.name || "No stage"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-3 py-1 text-xs font-bold rounded-full ${
                        task.priority === "URGENT"
                          ? "bg-red-100 text-red-800 border border-red-200"
                          : task.priority === "HIGH"
                          ? "bg-orange-100 text-orange-800 border border-orange-200"
                          : task.priority === "MEDIUM"
                          ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {task.assignee?.name || "Unassigned"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString()
                      : "No due date"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
