"use client";

import { useState } from "react";
import Link from "next/link";
import { Task, User, Project, Client, TemplateStage, Team, TaskComment, TaskArtifact, TaskStageLog, TimeLog, UserRole } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, User as UserIcon, AlertCircle, MessageSquare, Paperclip, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { CommentsList } from "./CommentsList";
import { ArtifactsList } from "./ArtifactsList";
import { AddCommentForm } from "./AddCommentForm";
import { AddArtifactForm } from "./AddArtifactForm";
import { TaskActionsMenu } from "./TaskActionsMenu";
import { ActivityButton } from "./ActivityButton";
import { WorkflowHistoryModal } from "./WorkflowHistoryModal";
import { TimeLogsList } from "./TimeLogsList";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type TaskWithRelations = Task & {
  project: Project & { client: Client };
  assignee: Pick<User, "id" | "name" | "email" | "image" | "teamId"> | null;
  currentStage: (TemplateStage & { defaultTeam: Team | null; template: { id: string; name: string } }) | null;
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
  availableNextStages: TemplateStage[];
  previousStages: TemplateStage[];
  currentUserId: string;
  currentUserRole: UserRole;
  activeLog: ActiveLog | null;
  allTemplateStages: (TemplateStage & { defaultTeam: { id: string; name: string } | null })[];
}

const priorityConfig = {
  LOW: { label: "Baixa", variant: "secondary" as const },
  MEDIUM: { label: "Média", variant: "default" as const },
  HIGH: { label: "Alta", variant: "outline" as const },
  URGENT: { label: "Urgente", variant: "destructive" as const },
};

const statusConfig = {
  BACKLOG: { label: "Backlog", variant: "secondary" as const },
  IN_PROGRESS: { label: "Em Progresso", variant: "default" as const },
  PAUSED: { label: "Pausado", variant: "outline" as const },
  COMPLETED: { label: "Concluído", variant: "default" as const },
  CANCELLED: { label: "Cancelado", variant: "destructive" as const },
};

export function TaskDetailView({
  task,
  availableNextStages,
  previousStages,
  currentUserId,
  currentUserRole,
  activeLog,
  allTemplateStages,
}: TaskDetailViewProps) {
  const [showArtifactForm, setShowArtifactForm] = useState(false);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const canViewTimeLogs = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.MANAGER;
  const totalHours = task.timeLogs.reduce((sum, log) => sum + log.hoursSpent, 0);

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
                Voltar
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
                  Status
                </p>
                <Badge variant={statusConfig[task.status].variant}>
                  {statusConfig[task.status].label}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Prioridade
                </p>
                <Badge variant={priorityConfig[task.priority].variant}>
                  {priorityConfig[task.priority].label}
                </Badge>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Responsável
                </p>
                {task.assignee ? (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={task.assignee.image || undefined} />
                      <AvatarFallback className="text-xs">
                        {task.assignee.name?.charAt(0).toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <p className="text-sm truncate">
                      {task.assignee.name || task.assignee.email}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserIcon className="h-4 w-4" />
                    <span className="text-sm">Não atribuído</span>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Data de Entrega
                </p>
                {task.dueDate ? (
                  <div className={`flex items-center gap-2 text-sm ${isOverdue ? "text-destructive" : ""}`}>
                    {isOverdue ? (
                      <AlertCircle className="h-4 w-4" />
                    ) : (
                      <Calendar className="h-4 w-4" />
                    )}
                    <span>
                      {format(new Date(task.dueDate), "dd/MM/yyyy", {
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Sem prazo</span>
                )}
              </div>
            </div>

            {/* Description */}
            {task.description && (
              <>
                <Separator />
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Descrição
                  </p>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">
                    {task.description}
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
              Comentários
              <Badge variant="secondary" className="ml-auto">
                {task.comments.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CommentsList
              comments={task.comments}
              currentUserId={currentUserId}
            />

            <Separator />

            {/* Add Comment Form */}
            <AddCommentForm taskId={task.id} userId={currentUserId} />
          </CardContent>
        </Card>
      </div>

      {/* Sidebar - Right Side */}
      <div className="space-y-6">
        {/* Actions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ações</CardTitle>
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
              currentAssignee={task.assignee?.name || task.assignee?.email || null}
              previousStages={previousStages}
            />
          </CardContent>
        </Card>

        {/* Artifacts Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Paperclip className="h-4 w-4" />
              Artefatos
              <Badge variant="secondary" className="ml-auto text-xs">
                {task.artifacts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ArtifactsList artifacts={task.artifacts} />

            {/* Toggle button for form */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowArtifactForm(!showArtifactForm)}
              className="w-full"
            >
              {showArtifactForm ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Ocultar Formulário
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Adicionar Link/Artefato
                </>
              )}
            </Button>

            {/* Collapsible Add Artifact Form */}
            {showArtifactForm && (
              <>
                <Separator />
                <AddArtifactForm taskId={task.id} userId={currentUserId} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Time Logs Section (Only for ADMIN/MANAGER) */}
        {canViewTimeLogs && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Tempo Registrado
                <Badge variant="secondary" className="ml-auto text-xs">
                  {totalHours.toFixed(1)}h total
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
