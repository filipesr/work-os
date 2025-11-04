import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getTaskById,
  getAvailableNextStages,
  getPreviousStages,
} from "@/lib/actions/task";
import { AdvanceStageButton } from "@/components/tasks/AdvanceStageButton";
import { RevertStageButton } from "@/components/tasks/RevertStageButton";

export default async function TaskDetailPage({
  params,
}: {
  params: { taskId: string };
}) {
  const [task, availableNextStages, previousStages] = await Promise.all([
    getTaskById(params.taskId),
    getAvailableNextStages(params.taskId),
    getPreviousStages(params.taskId),
  ]);

  if (!task) {
    notFound();
  }

  return (
    <div className="container mx-auto p-8">
      {/* Back link */}
      <Link
        href="/admin/tasks"
        className="inline-flex items-center text-primary hover:text-primary/80 mb-6 font-semibold transition-colors"
      >
        <svg
          className="w-5 h-5 mr-2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path d="M15 19l-7-7 7-7" />
        </svg>
        Back to Tasks
      </Link>

      {/* Task Header */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground mb-2">{task.title}</h1>
            <p className="text-muted-foreground">{task.description || "No description"}</p>
          </div>
          <div className="ml-4">
            <span
              className={`px-3 py-1 text-sm font-bold rounded-full ${
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
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t-2 border-border">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Project</p>
            <p className="mt-1 text-sm text-foreground font-medium">
              {task.project.client.name} - {task.project.name}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Priority</p>
            <p className="mt-1">
              <span
                className={`px-2 py-1 text-xs font-bold rounded-full ${
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
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Assignee</p>
            <p className="mt-1 text-sm text-foreground font-medium">
              {task.assignee?.name || "Unassigned"}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Due Date</p>
            <p className="mt-1 text-sm text-foreground font-medium">
              {task.dueDate
                ? new Date(task.dueDate).toLocaleDateString()
                : "No due date"}
            </p>
          </div>
        </div>
      </div>

      {/* Current Stage & Actions */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">Current Stage</h2>
          <div className="flex gap-2">
            <AdvanceStageButton
              taskId={task.id}
              availableStages={availableNextStages}
            />
            <RevertStageButton
              taskId={task.id}
              previousStages={previousStages}
            />
          </div>
        </div>

        {task.currentStage ? (
          <div className="border-2 border-primary/20 bg-primary/5 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold">
                {task.currentStage.order}
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">
                  {task.currentStage.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Template: {task.currentStage.template.name}
                </p>
                {task.currentStage.defaultTeam && (
                  <p className="text-sm text-muted-foreground">
                    Team: {task.currentStage.defaultTeam.name}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">No current stage assigned</p>
        )}
      </div>

      {/* Stage History */}
      <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mb-6">
        <h2 className="text-xl font-bold text-foreground mb-4">Stage History</h2>
        {task.stageLogs.length === 0 ? (
          <p className="text-muted-foreground">No stage history yet</p>
        ) : (
          <div className="space-y-4">
            {task.stageLogs.map((log: any) => (
              <div key={log.id} className="border-l-4 border-primary pl-4 py-2 bg-muted/30 rounded-r-lg">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{log.stage.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Entered by {log.user.name || log.user.email}
                    </p>
                  </div>
                  <div className="ml-4 text-right text-sm text-muted-foreground">
                    <p>Entered: {new Date(log.enteredAt).toLocaleString()}</p>
                    {log.exitedAt && (
                      <p>Exited: {new Date(log.exitedAt).toLocaleString()}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comments */}
      {task.comments.length > 0 && (
        <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
          <h2 className="text-xl font-bold text-foreground mb-4">Comments</h2>
          <div className="space-y-4">
            {task.comments.map((comment: any) => (
              <div
                key={comment.id}
                className={`border-l-4 pl-4 py-2 rounded-r-lg ${
                  comment.content.startsWith("**REVERTED")
                    ? "border-orange-500 bg-orange-50"
                    : "border-border bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-foreground whitespace-pre-wrap font-medium">
                      {comment.content}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      By {comment.user.name || comment.user.email} •{" "}
                      {new Date(comment.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
