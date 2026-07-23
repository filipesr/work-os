import { notFound } from "next/navigation";
import { getTaskById, getPreviousStages, getTaskTimeTracking } from "@/lib/actions/task";
import { AdvanceStageButton } from "@/components/tasks/AdvanceStageButton";
import { RevertStageButton } from "@/components/tasks/RevertStageButton";
import { UnassignActiveStageButton } from "@/components/tasks/UnassignActiveStageButton";
import { CompleteTaskButton } from "@/components/tasks/CompleteTaskButton";
import prisma from "@/lib/prisma";
import { mapArtifactRow } from "@/lib/artifacts/unify";
import { UnifiedArtifactsPanel } from "@/components/artifacts/UnifiedArtifactsPanel";
import { TaskLifecycleActions } from "@/components/tasks/TaskLifecycleActions";
import { TimeLogsList } from "@/components/tasks/TimeLogsList";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { taskStatusTone, priorityTone } from "@/lib/status-tone";
import { Paperclip } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";

interface StageLogRow {
  id: string;
  stage: { name: string };
  user: { name: string | null; email: string | null };
  enteredAt: Date;
  exitedAt: Date | null;
}

interface CommentRow {
  id: string;
  content: string;
  user: { name: string | null; email: string | null };
  createdAt: Date;
}

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const t = await getTranslations("admin.tasks.detail");
  const { taskId } = await params;
  const [task, previousStages, timeTracking] = await Promise.all([
    getTaskById(taskId),
    getPreviousStages(taskId),
    getTaskTimeTracking(taskId),
  ]);

  if (!task) {
    notFound();
  }

  // Artefatos de projeto/cliente (escopo) para a tabela única com Origem.
  const scoped = await prisma.project.findUnique({
    where: { id: task.project.id },
    select: {
      artifacts: {
        where: { scope: "PROJECT", isCurrent: true },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      client: {
        select: {
          artifacts: {
            where: { scope: "CLIENT", isCurrent: true },
            include: { user: { select: { name: true, email: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  const artifactRows = [
    ...task.artifacts.map((a) => mapArtifactRow(a, "TASK", { id: task.id, title: task.title })),
    ...(scoped?.artifacts ?? []).map((a) => mapArtifactRow(a, "PROJECT")),
    ...(scoped?.client.artifacts ?? []).map((a) => mapArtifactRow(a, "CLIENT")),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={`${task.project.client.name} · ${task.project.name}`}
        title={task.title}
        subtitle={task.description || t("noDescription")}
        backHref={`/admin/projects/${task.project.id}`}
        backLabel={t("backToProject")}
        actions={
          <StatusBadge tone={taskStatusTone(task.status)} label={t(`taskStatus.${task.status}`)} />
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Lifecycle + meta */}
          <SectionCard>
            <div className="mb-4">
              <TaskLifecycleActions taskId={task.id} taskStatus={task.status} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-border pt-4">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t("project")}</p>
                <p className="mt-1 text-sm text-foreground font-medium">
                  {task.project.client.name} - {task.project.name}
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">{t("priority")}</p>
                <p className="mt-1">
                  <StatusBadge
                    tone={priorityTone(task.priority)}
                    label={t(`taskPriority.${task.priority}`)}
                  />
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
                  {task.dueDate ? formatDisplayDate(task.dueDate) : t("noDueDate")}
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Current Stage & Actions */}
          <SectionCard
            title={t("currentStage")}
            action={
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
            }
          >
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
          </SectionCard>

          {/* All stages pipeline (status + responsible per stage) */}
          <SectionCard title={t("allStages")}>
            <div className="space-y-2">
              {task.stagePipeline.map((ps) => {
                const responsible = ps.assignee?.name || ps.assignee?.email || null;
                const statusClass =
                  ps.status === "ACTIVE"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : ps.status === "COMPLETED"
                      ? "bg-success-subtle text-success border-success/40"
                      : ps.status === "BLOCKED"
                        ? "bg-warning-subtle text-warning border-warning/40"
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
          </SectionCard>

          {/* Stage History */}
          <SectionCard title={t("stageHistory")}>
            {task.stageLogs.length === 0 ? (
              <p className="text-muted-foreground">{t("noStageHistory")}</p>
            ) : (
              <div className="space-y-4">
                {task.stageLogs.map((log: StageLogRow) => (
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
                          {t("entered")} {formatDisplayDateTime(log.enteredAt)}
                        </p>
                        {log.exitedAt && (
                          <p>
                            {t("exited")} {formatDisplayDateTime(log.exitedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Comments */}
          {task.comments.length > 0 && (
            <SectionCard title={t("comments")}>
              <div className="space-y-4">
                {task.comments.map((comment: CommentRow) => (
                  <div
                    key={comment.id}
                    className={`border-l-4 pl-4 py-2 rounded-r-lg ${
                      comment.content.startsWith("**REVERTED")
                        ? "border-warning/40 bg-warning-subtle"
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
                          {formatDisplayDateTime(comment.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Artifacts + time tracking sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Paperclip className="h-4 w-4" />
                  {t("artifacts")}
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {artifactRows.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <UnifiedArtifactsPanel
                  rows={artifactRows}
                  scope="TASK"
                  ownerIds={{
                    taskId: task.id,
                    projectId: task.project.id,
                    clientId: task.project.clientId,
                  }}
                  currentTaskId={task.id}
                  canAdd
                  canRemove
                />
                {/* §3: StorageBreakdown removido do detalhe da tarefa (infra/capacidade
                    vive em Clientes/Projetos). */}
              </CardContent>
            </Card>

            {/* Time tracking (registered time logs + open/running activities) */}
            <SectionCard title={t("timeLogs")}>
              {timeTracking.openActivities.length > 0 && (
                <div className="space-y-2 mb-4">
                  {timeTracking.openActivities.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-lg border border-success/40 bg-success-subtle px-3 py-2"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={getProxiedImageUrl(a.user.image) || undefined} />
                        <AvatarFallback className="text-xs">
                          {a.user.name?.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {a.user.name || a.user.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("timeStartedAt")} {formatDisplayDateTime(a.startedAt)}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success-subtle px-2 py-0.5 text-xs font-bold text-success">
                        <span className="h-2 w-2 rounded-full bg-success-subtle0 animate-pulse" />
                        {t("timeRunning")}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <TimeLogsList timeLogs={timeTracking.timeLogs} />
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
