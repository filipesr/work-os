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
        className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6"
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
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{task.title}</h1>
            <p className="text-gray-600">{task.description || "No description"}</p>
          </div>
          <div className="ml-4">
            <span
              className={`px-3 py-1 text-sm font-semibold rounded-full ${
                task.status === "DONE"
                  ? "bg-green-100 text-green-800"
                  : task.status === "IN_PROGRESS"
                  ? "bg-blue-100 text-blue-800"
                  : task.status === "BLOCKED"
                  ? "bg-red-100 text-red-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {task.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
          <div>
            <p className="text-sm font-medium text-gray-500">Project</p>
            <p className="mt-1 text-sm text-gray-900">
              {task.project.client.name} - {task.project.name}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Priority</p>
            <p className="mt-1">
              <span
                className={`px-2 py-1 text-xs font-semibold rounded-full ${
                  task.priority === "URGENT"
                    ? "bg-red-100 text-red-800"
                    : task.priority === "HIGH"
                    ? "bg-orange-100 text-orange-800"
                    : task.priority === "MEDIUM"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {task.priority}
              </span>
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Assignee</p>
            <p className="mt-1 text-sm text-gray-900">
              {task.assignee?.name || "Unassigned"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Due Date</p>
            <p className="mt-1 text-sm text-gray-900">
              {task.dueDate
                ? new Date(task.dueDate).toLocaleDateString()
                : "No due date"}
            </p>
          </div>
        </div>
      </div>

      {/* Current Stage & Actions */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Current Stage</h2>
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
          <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white font-semibold">
                {task.currentStage.order}
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-medium text-gray-900">
                  {task.currentStage.name}
                </h3>
                <p className="text-sm text-gray-600">
                  Template: {task.currentStage.template.name}
                </p>
                {task.currentStage.defaultTeam && (
                  <p className="text-sm text-gray-600">
                    Team: {task.currentStage.defaultTeam.name}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">No current stage assigned</p>
        )}
      </div>

      {/* Stage History */}
      <div className="bg-white shadow rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Stage History</h2>
        {task.stageLogs.length === 0 ? (
          <p className="text-gray-500">No stage history yet</p>
        ) : (
          <div className="space-y-4">
            {task.stageLogs.map((log: any) => (
              <div key={log.id} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-900">{log.stage.name}</h3>
                    <p className="text-sm text-gray-600">
                      Entered by {log.user.name || log.user.email}
                    </p>
                  </div>
                  <div className="ml-4 text-right text-sm text-gray-500">
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
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Comments</h2>
          <div className="space-y-4">
            {task.comments.map((comment: any) => (
              <div
                key={comment.id}
                className={`border-l-4 pl-4 py-2 ${
                  comment.content.startsWith("**REVERTED")
                    ? "border-orange-500 bg-orange-50"
                    : "border-gray-300"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm text-gray-900 whitespace-pre-wrap">
                      {comment.content}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
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
