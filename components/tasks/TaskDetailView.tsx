"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Task,
  User,
  Project,
  Client,
  TemplateStage,
  Team,
  TaskComment,
  TaskArtifact,
  TaskStageLog,
  TimeLog,
  UserRole,
} from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Calendar,
  User as UserIcon,
  AlertCircle,
  MessageSquare,
  Paperclip,
  Clock,
} from "lucide-react";
import { CommentsList } from "./CommentsList";
import { AddCommentForm } from "./AddCommentForm";
import { UnifiedArtifactsPanel } from "@/components/artifacts/UnifiedArtifactsPanel";
import { StorageBreakdown } from "@/components/nas/StorageBreakdown";
import type { StorageStats } from "@/lib/nas/storage-format";
import { type UnifiedArtifactRow } from "@/lib/artifacts/unify";
import { TaskActionsMenu } from "./TaskActionsMenu";
import { ActivityButton } from "./ActivityButton";
import { TimeLogsList } from "./TimeLogsList";

const WorkflowHistoryModal = dynamic(
  () => import("./WorkflowHistoryModal").then((mod) => mod.WorkflowHistoryModal),
  { ssr: false }
);
import { format } from "date-fns";
import { dateFnsLocale } from "@/lib/date-locale";
import { useTranslations, useLocale } from "next-intl";

type TaskWithRelations = Task & {
  project: Project & { client: Client };
  assignee: Pick<User, "id" | "name" | "email" | "image"> | null;
  currentStage:
    | (TemplateStage & { defaultTeam: Team | null; template: { id: string; name: string } })
    | null;
  currentStageId: string | null;
  comments: (TaskComment & { user: Pick<User, "id" | "name" | "email" | "image"> })[];
  artifacts: (TaskArtifact & { user: Pick<User, "id" | "name" | "email" | "image"> })[];
  stageLogs: (TaskStageLog & {
    stage: TemplateStage;
    user: Pick<User, "id" | "name" | "email" | "image">;
  })[];
  timeLogs: (TimeLog & {
    user: Pick<User, "id" | "name" | "email" | "image">;
    stage: Pick<TemplateStage, "id" | "name" | "order"> | null;
  })[];
};

interface ActiveLog {
  id: string;
  taskId: string;
  task: {
    id: string;
    title: string;
  };
}

interface TaskDetailViewProps {
  task: TaskWithRelations;
  artifactRows: UnifiedArtifactRow[];
  canManageScoped: boolean;
  availableNextStages: TemplateStage[];
  previousStages: TemplateStage[];
  currentUserId: string;
  currentUserRole: UserRole;
  activeLog: ActiveLog | null;
  allTemplateStages: (TemplateStage & { defaultTeam: { id: string; name: string } | null })[];
  canPerformActions: boolean;
  currentStageAssignee?: string | null;
  typeStorage: StorageStats;
}

export function TaskDetailView({
  task,
  artifactRows,
  canManageScoped,
  availableNextStages,
  previousStages,
  currentUserId,
  currentUserRole,
  activeLog,
  allTemplateStages,
  canPerformActions,
  currentStageAssignee,
  typeStorage,
}: TaskDetailViewProps) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const canViewTimeLogs =
    currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.MANAGER;
  const totalHours = task.timeLogs.reduce((sum, log) => sum + log.hoursSpent, 0);

  const t = useTranslations("tasks");
  const tDetail = useTranslations("tasks.detail");
  const tPriority = useTranslations("tasks.priority");
  const tComments = useTranslations("tasks.comments");
  const tArtifacts = useTranslations("tasks.artifacts");
  const tTimeLogs = useTranslations("tasks.timeLogs");
  const locale = useLocale();
  const dateLocale = dateFnsLocale(locale);

  const priorityConfig = {
    LOW: { label: tPriority("low"), variant: "secondary" as const },
    MEDIUM: { label: tPriority("medium"), variant: "default" as const },
    HIGH: { label: tPriority("high"), variant: "outline" as const },
    URGENT: { label: tPriority("urgent"), variant: "destructive" as const },
  };

  const tStatus = useTranslations("tasks.status");

  const statusConfig = {
    BACKLOG: { label: tStatus("backlog"), variant: "secondary" as const },
    IN_PROGRESS: { label: tStatus("inProgress"), variant: "default" as const },
    PAUSED: { label: tStatus("paused"), variant: "outline" as const },
    COMPLETED: { label: tStatus("completed"), variant: "default" as const },
    CANCELLED: { label: tStatus("cancelled"), variant: "destructive" as const },
    OBSOLETE: { label: tStatus("obsolete"), variant: "outline" as const },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Content - Left Side */}
      <div className="lg:col-span-2 space-y-6">
        {/* Main Task Card - Title + Details + Current Stage */}
        <Card>
          <CardHeader>
            {/* Back Button + Title Row */}
            <div className="flex items-start gap-4 mb-4">
              <Link
                href={`/projects/${task.projectId}`}
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground shrink-0 mt-1"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                {tDetail("backToTasks")}
              </Link>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold leading-tight mb-2">{task.title}</h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{task.project.client.name}</span>
                  <span>•</span>
                  <span>{task.project.name}</span>
                </div>
              </div>
              {/* Top Right Corner: Current Stage Tag + History Button */}
              <div className="flex items-center gap-2 shrink-0">
                {task.currentStage && (
                  <Badge variant="default" className="gap-1.5">
                    <span className="font-bold">{task.currentStage.order}</span>
                    <span>•</span>
                    <span>{task.currentStage.name}</span>
                  </Badge>
                )}
                <WorkflowHistoryModal
                  allStages={allTemplateStages}
                  stageLogs={task.stageLogs}
                  comments={task.comments}
                  artifacts={task.artifacts}
                  currentUserId={currentUserId}
                  currentStageId={task.currentStageId}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {tDetail("status")}
                </p>
                <Badge variant={statusConfig[task.status].variant}>
                  {statusConfig[task.status].label}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {tDetail("priority")}
                </p>
                <Badge variant={priorityConfig[task.priority].variant}>
                  {priorityConfig[task.priority].label}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {tDetail("assignee")}
                </p>
                {task.assignee ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={task.assignee.image || undefined} />
                      <AvatarFallback className="text-xs">
                        {task.assignee.name?.charAt(0).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm truncate">{task.assignee.name || task.assignee.email}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserIcon className="h-4 w-4" />
                    <span className="text-sm">{tDetail("noDescription")}</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {tDetail("dueDate")}
                </p>
                {task.dueDate ? (
                  <div
                    className={`flex items-center gap-2 text-sm ${isOverdue ? "text-destructive" : ""}`}
                  >
                    {isOverdue ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      <Calendar className="h-4 w-4" />
                    )}
                    <span>
                      {format(new Date(task.dueDate), "dd/MM/yyyy", {
                        locale: dateLocale,
                      })}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">{tDetail("noDescription")}</span>
                )}
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    {tDetail("description")}
                  </p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{task.description}</p>
                </div>
              </>
            )}

            {/* Descrição do projeto em destaque (contexto da demanda) */}
            {task.project.description && (
              <>
                <Separator />
                <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-primary mb-1">
                    {tDetail("aboutProject")} · {task.project.name}
                  </p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {task.project.description}
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Comments Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              {tComments("title")}
              <Badge variant="secondary" className="ml-auto">
                {task.comments.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CommentsList comments={task.comments} currentUserId={currentUserId} />

            <Separator />

            {/* Add Comment Form */}
            <AddCommentForm taskId={task.id} userId={currentUserId} />
          </CardContent>
        </Card>
      </div>

      {/* Sidebar - Right Side */}
      <div className="space-y-6">
        {/* Actions Card */}
        {canPerformActions && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("actions.edit")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Activity Tracking */}
              <ActivityButton
                taskId={task.id}
                taskTitle={task.title}
                currentStageId={task.currentStageId}
                activeLog={activeLog}
              />

              <Separator />

              {/* Actions Menu */}
              <TaskActionsMenu
                taskId={task.id}
                currentStageId={task.currentStageId}
                taskStatus={task.status}
                currentStageAssignee={currentStageAssignee}
                previousStages={previousStages}
              />
            </CardContent>
          </Card>
        )}

        {/* Artifacts Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              {tArtifacts("title")}
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
                projectId: task.projectId,
                clientId: task.project.clientId,
              }}
              currentTaskId={task.id}
              canAdd={canPerformActions}
              canRemove={canManageScoped}
            />
            <div className="mt-4">
              <StorageBreakdown title={tDetail("storageByType")} stats={typeStorage} />
            </div>
          </CardContent>
        </Card>

        {/* Time Logs Section (Only for ADMIN/MANAGER) */}
        {canViewTimeLogs && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {tTimeLogs("title")}
                <Badge variant="secondary" className="ml-auto text-xs">
                  {tTimeLogs("totalHours", { hours: totalHours.toFixed(1) })}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TimeLogsList timeLogs={task.timeLogs} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
