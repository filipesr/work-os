"use client";

import dynamic from "next/dynamic";
import { type ReactNode } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { taskStatusTone, priorityTone } from "@/lib/status-tone";
import {
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
  /** Time EFETIVO da etapa atual (roteado na criação, se for coringa). */
  currentStageTeam?: { id: string; name: string } | null;
  /** O que precisa ser feito nesta etapa — escrito na criação da demanda. */
  currentStageInstructions?: string | null;
}

/** Pílula de contagem para os headers de seção (comentários / artefatos / horas). */
function CountPill({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}

/** Micro-label de campo (não-formulário) dentro do card de detalhes. */
function FieldMicroLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-xs font-medium text-muted-foreground">{children}</p>;
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
  currentStageTeam,
  currentStageInstructions,
}: TaskDetailViewProps) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const canViewTimeLogs =
    currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.MANAGER;
  const totalHours = task.timeLogs.reduce((sum, log) => sum + log.hoursSpent, 0);

  const t = useTranslations("tasks");
  const tDetail = useTranslations("tasks.detail");
  const tPriority = useTranslations("tasks.priority");
  const tStatus = useTranslations("tasks.status");
  const tComments = useTranslations("tasks.comments");
  const tArtifacts = useTranslations("tasks.artifacts");
  const tTimeLogs = useTranslations("tasks.timeLogs");
  const locale = useLocale();
  const dateLocale = dateFnsLocale(locale);

  const statusLabels: Record<Task["status"], string> = {
    BACKLOG: tStatus("backlog"),
    IN_PROGRESS: tStatus("inProgress"),
    PAUSED: tStatus("paused"),
    COMPLETED: tStatus("completed"),
    CANCELLED: tStatus("cancelled"),
    OBSOLETE: tStatus("obsolete"),
  };
  const priorityLabel = tPriority(task.priority.toLowerCase());

  return (
    <>
      <PageHeader
        kicker={tDetail("kicker")}
        title={task.title}
        subtitle={`${task.project.client.name} · ${task.project.name}`}
        backHref={`/projects/${task.projectId}`}
        backLabel={tDetail("backToProject")}
        actions={
          <>
            {task.currentStage && (
              <StatusBadge
                tone="info"
                label={`${task.currentStage.order} · ${task.currentStage.name}`}
              />
            )}
            <WorkflowHistoryModal
              allStages={allTemplateStages}
              stageLogs={task.stageLogs}
              comments={task.comments}
              artifacts={task.artifacts}
              currentUserId={currentUserId}
              currentStageId={task.currentStageId}
            />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main Content - Left Side */}
        <div className="space-y-6 lg:col-span-2">
          {/* Details card — status/prioridade/responsável/prazo + descrições */}
          <SectionCard title={tDetail("taskDetails")} bodyClassName="space-y-4 p-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldMicroLabel>{tDetail("status")}</FieldMicroLabel>
                <StatusBadge tone={taskStatusTone(task.status)} label={statusLabels[task.status]} />
              </div>
              <div>
                <FieldMicroLabel>{tDetail("priority")}</FieldMicroLabel>
                <StatusBadge tone={priorityTone(task.priority)} label={priorityLabel} />
              </div>
              <div>
                <FieldMicroLabel>{tDetail("assignee")}</FieldMicroLabel>
                {task.assignee ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={task.assignee.image || undefined} />
                      <AvatarFallback className="text-xs">
                        {task.assignee.name?.charAt(0).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <p className="truncate text-sm text-foreground">
                      {task.assignee.name || task.assignee.email}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserIcon className="h-4 w-4" />
                    <span className="text-sm">{tDetail("unassigned")}</span>
                  </div>
                )}
              </div>
              <div>
                <FieldMicroLabel>{tDetail("dueDate")}</FieldMicroLabel>
                {task.dueDate ? (
                  <div
                    className={`flex items-center gap-2 text-sm ${
                      isOverdue ? "font-medium text-danger" : "text-foreground"
                    }`}
                  >
                    {isOverdue ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span>
                      {format(new Date(task.dueDate), "dd/MM/yyyy", {
                        locale: dateLocale,
                      })}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">{tDetail("noDueDate")}</span>
                )}
              </div>
            </div>

            {/* Direcionamento da etapa atual. Numa etapa coringa o nome não diz
                o que fazer — sem isto, quem executa fica sem instrução alguma. */}
            {currentStageInstructions && task.currentStage && (
              <>
                <Separator />
                <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3">
                  <p className="mb-1 text-xs font-semibold text-warning">
                    {tDetail("stageInstructions", {
                      stage: task.currentStage.name,
                      team: currentStageTeam?.name ?? tDetail("unassigned"),
                    })}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {currentStageInstructions}
                  </p>
                </div>
              </>
            )}

            {/* Description */}
            {task.description && (
              <>
                <Separator />
                <div>
                  <FieldMicroLabel>{tDetail("description")}</FieldMicroLabel>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {task.description}
                  </p>
                </div>
              </>
            )}

            {/* Descrição do projeto em destaque (contexto da demanda) */}
            {task.project.description && (
              <>
                <Separator />
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="mb-1 text-xs font-semibold text-primary">
                    {tDetail("aboutProject")} · {task.project.name}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {task.project.description}
                  </p>
                </div>
              </>
            )}
          </SectionCard>

          {/* Comments Section */}
          <SectionCard
            title={tComments("title")}
            icon={MessageSquare}
            badge={<CountPill>{task.comments.length}</CountPill>}
            bodyClassName="space-y-4 p-6"
          >
            <CommentsList comments={task.comments} currentUserId={currentUserId} />
            <Separator />
            <AddCommentForm taskId={task.id} userId={currentUserId} />
          </SectionCard>
        </div>

        {/* Sidebar - Right Side */}
        <div className="space-y-6">
          {/* Actions Card */}
          {canPerformActions && (
            <SectionCard title={tDetail("actionsTitle")} bodyClassName="space-y-4 p-6">
              <ActivityButton
                taskId={task.id}
                taskTitle={task.title}
                currentStageId={task.currentStageId}
                activeLog={activeLog}
              />
              <Separator />
              <TaskActionsMenu
                taskId={task.id}
                currentStageId={task.currentStageId}
                taskStatus={task.status}
                currentStageAssignee={currentStageAssignee}
                previousStages={previousStages}
              />
            </SectionCard>
          )}

          {/* Artifacts Section */}
          <SectionCard
            title={tArtifacts("title")}
            icon={Paperclip}
            badge={<CountPill>{artifactRows.length}</CountPill>}
          >
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
            {/* §3: StorageBreakdown (bytes por mídia) removido do detalhe da tarefa —
                é infra/capacidade, vive em Clientes/Projetos, não na tela de "fazer". */}
          </SectionCard>

          {/* Time Logs Section (Only for ADMIN/MANAGER) */}
          {canViewTimeLogs && (
            <SectionCard
              title={tTimeLogs("title")}
              icon={Clock}
              badge={
                <CountPill>{tTimeLogs("totalHours", { hours: totalHours.toFixed(1) })}</CountPill>
              }
            >
              <TimeLogsList timeLogs={task.timeLogs} />
            </SectionCard>
          )}
        </div>
      </div>
    </>
  );
}
