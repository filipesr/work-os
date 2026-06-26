import { notFound } from "next/navigation";
import Link from "next/link";
import { getTaskById, getPreviousStages } from "@/lib/actions/task";
import { AdvanceStageButton } from "@/components/tasks/AdvanceStageButton";
import { RevertStageButton } from "@/components/tasks/RevertStageButton";
import { UnassignActiveStageButton } from "@/components/tasks/UnassignActiveStageButton";
import { CompleteTaskButton } from "@/components/tasks/CompleteTaskButton";
import { ArtifactsList } from "@/components/tasks/ArtifactsList";
import { getTranslations } from "next-intl/server";

function formatDate(value: Date | string): string {
  const d = new Date(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function formatDateTime(value: Date | string): string {
  const d = new Date(value);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${min}`;
}

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const t = await getTranslations("admin.tasks.detail");
  const { taskId } = await params;
  const [task, previousStages] = await Promise.all([
    getTaskById(taskId),
    getPreviousStages(taskId),
  ]);

  if (!task) {
    notFound();
  }

  return (
    <div className="container mx-auto p-8">
      {/* Back link — returns to the parent project */}
      <Link
        href={`/admin/projects/${task.project.id}`}
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
        {t("backToProject")}
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main content */}
        <div className="lg:col-span-3">
          {/* Task Header */}
          <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h1 className="text-3xl font-bold text-foreground mb-2">{task.title}</h1>
                <p className="text-muted-foreground">{task.description || t("noDescription")}</p>
              </div>
              <div className="ml-4">
                <span
                  className={`px-3 py-1 text-sm font-bold rounded-full ${
                    task.status === "COMPLETED"
                      ? "bg-green-100 text-green-800 border border-green-200"
                      : task.status === "IN_PROGRESS"
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : task.status === "CANCELLED"
                          ? "bg-destructive/10 text-destructive border border-destructive/20"
                          : task.status === "PAUSED"
                            ? "bg-orange-100 text-orange-800 border border-orange-200"
                            : "bg-muted text-muted-foreground border border-border"
                  }`}
                >
                  {t(`taskStatus.${task.status}`)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t-2 border-border">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t("project")}</p>
                <p className="mt-1 text-sm text-foreground font-medium">
                  {task.project.client.name} - {task.project.name}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t("priority")}</p>
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
                    {t(`taskPriority.${task.priority}`)}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t("assignee")}</p>
                <p className="mt-1 text-sm text-foreground font-medium">
                  {task.assignee?.name || t("unassigned")}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t("dueDate")}</p>
                <p className="mt-1 text-sm text-foreground font-medium">
                  {task.dueDate ? formatDate(task.dueDate) : t("noDueDate")}
                </p>
              </div>
            </div>
          </div>

          {/* Current Stage & Actions */}
          <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">{t("currentStage")}</h2>
              <div className="flex gap-2 flex-wrap">
                <AdvanceStageButton taskId={task.id} currentStageId={task.currentStageId} />
                <RevertStageButton taskId={task.id} previousStages={previousStages} />
                <CompleteTaskButton taskId={task.id} taskStatus={task.status} />
                {task.currentStageId && (
                  <UnassignActiveStageButton
                    taskId={task.id}
                    stageId={task.currentStageId}
                    currentAssignee={task.assignee?.name || task.assignee?.email || null}
                  />
                )}
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
                      {t("template")} {task.currentStage.template.name}
                    </p>
                    {task.currentStage.defaultTeam && (
                      <p className="text-sm text-muted-foreground">
                        {t("team")} {task.currentStage.defaultTeam.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">{t("noCurrentStage")}</p>
            )}
          </div>

          {/* All stages pipeline (status + responsible per stage) */}
          <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mb-6">
            <h2 className="text-xl font-bold text-foreground mb-4">{t("allStages")}</h2>
            <div className="space-y-2">
              {task.stagePipeline.map((ps) => {
                const responsible = ps.assignee?.name || ps.assignee?.email || null;
                const statusClass =
                  ps.status === "ACTIVE"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : ps.status === "COMPLETED"
                      ? "bg-green-100 text-green-800 border-green-200"
                      : ps.status === "BLOCKED"
                        ? "bg-orange-100 text-orange-800 border-orange-200"
                        : "bg-muted text-muted-foreground border-border";
                return (
                  <div
                    key={ps.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                      {ps.stage.order}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {ps.stage.name}
                      </p>
                      {ps.stage.defaultTeam && (
                        <p className="truncate text-xs text-muted-foreground">
                          {ps.stage.defaultTeam.name}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span
                        className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${statusClass}`}
                      >
                        {t(`stageStatus.${ps.status}`)}
                      </span>
                      <p className="mt-0.5 text-xs">
                        {responsible ? (
                          <span className="font-medium text-foreground">{responsible}</span>
                        ) : (
                          <span className="text-muted-foreground">{t("unassigned")}</span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stage History */}
          <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6 mb-6">
            <h2 className="text-xl font-bold text-foreground mb-4">{t("stageHistory")}</h2>
            {task.stageLogs.length === 0 ? (
              <p className="text-muted-foreground">{t("noStageHistory")}</p>
            ) : (
              <div className="space-y-4">
                {task.stageLogs.map((log: any) => (
                  <div
                    key={log.id}
                    className="border-l-4 border-primary pl-4 py-2 bg-muted/30 rounded-r-lg"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{log.stage.name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t("enteredBy")} {log.user.name || log.user.email}
                        </p>
                      </div>
                      <div className="ml-4 text-right text-sm text-muted-foreground">
                        <p>
                          {t("entered")} {formatDateTime(log.enteredAt)}
                        </p>
                        {log.exitedAt && (
                          <p>
                            {t("exited")} {formatDateTime(log.exitedAt)}
                          </p>
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
              <h2 className="text-xl font-bold text-foreground mb-4">{t("comments")}</h2>
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
                          {t("by")} {comment.user.name || comment.user.email} •{" "}
                          {formatDateTime(comment.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Artifacts Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-24">
            <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
              <h2 className="text-xl font-bold text-foreground mb-4">{t("artifacts")}</h2>
              {task.artifacts.length > 0 ? (
                <ArtifactsList artifacts={task.artifacts} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("noArtifacts")}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
