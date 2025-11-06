"use client";

import Link from "next/link";
import { Task, User, Project, Client, TemplateStage, Team, TaskComment, TaskArtifact, TaskStageLog } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Calendar, User as UserIcon, AlertCircle, MessageSquare, Paperclip } from "lucide-react";
import { CommentsList } from "./CommentsList";
import { ArtifactsList } from "./ArtifactsList";
import { AddCommentForm } from "./AddCommentForm";
import { AddArtifactForm } from "./AddArtifactForm";
import { TaskActionsMenu } from "./TaskActionsMenu";
import { ActivityButton } from "./ActivityButton";
import { StageWorkflowVisualization } from "./StageWorkflowVisualization";
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
  activeLog,
  allTemplateStages,
}: TaskDetailViewProps) {
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Content - Left Side */}
      <div className="lg:col-span-2 space-y-6">
        {/* Back Button */}
        <Link
          href={`/projects/${task.projectId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar ao projeto
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">{task.title}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{task.project.client.name}</span>
            <span>•</span>
            <span>{task.project.name}</span>
          </div>
        </div>

        {/* Description */}
        {task.description && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Descrição</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{task.description}</p>
            </CardContent>
          </Card>
        )}

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
            {/* Comments List */}
            <CommentsList
              comments={task.comments}
              currentUserId={currentUserId}
            />

            <Separator />

            {/* Add Comment Form at bottom */}
            <AddCommentForm taskId={task.id} userId={currentUserId} />
          </CardContent>
        </Card>

        {/* Artifacts Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Artefatos
              <Badge variant="secondary" className="ml-auto">
                {task.artifacts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Artifacts List */}
            <ArtifactsList artifacts={task.artifacts} />

            <Separator />

            {/* Add Artifact Form at bottom */}
            <AddArtifactForm taskId={task.id} userId={currentUserId} />
          </CardContent>
        </Card>
      </div>

      {/* Sidebar - Right Side */}
      <div className="space-y-6">
        {/* Current Stage & Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Etapa Atual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {task.currentStage ? (
              <>
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-semibold">
                      {task.currentStage.order}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-medium">{task.currentStage.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {task.currentStage.template.name}
                      </p>
                    </div>
                  </div>
                  {task.currentStage.defaultTeam && (
                    <p className="text-xs text-muted-foreground">
                      Time: {task.currentStage.defaultTeam.name}
                    </p>
                  )}
                </div>

                {/* Activity Tracking (Start/Stop Task) */}
                <ActivityButton
                  taskId={task.id}
                  taskTitle={task.title}
                  currentStageId={task.currentStageId}
                  activeLog={activeLog}
                />

                <Separator />

                {/* Compact Actions Menu */}
                <TaskActionsMenu
                  taskId={task.id}
                  currentStageId={task.currentStageId}
                  taskStatus={task.status}
                  currentAssignee={task.assignee?.name || task.assignee?.email || null}
                  previousStages={previousStages}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma etapa atribuída
              </p>
            )}
          </CardContent>
        </Card>

        {/* Task Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detalhes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Status
              </p>
              <Badge variant={statusConfig[task.status].variant}>
                {statusConfig[task.status].label}
              </Badge>
            </div>

            <Separator />

            {/* Priority */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Prioridade
              </p>
              <Badge variant={priorityConfig[task.priority].variant}>
                {priorityConfig[task.priority].label}
              </Badge>
            </div>

            <Separator />

            {/* Assignee */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Responsável
              </p>
              {task.assignee ? (
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={task.assignee.image || undefined} />
                    <AvatarFallback>
                      {task.assignee.name?.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {task.assignee.name || task.assignee.email}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UserIcon className="h-4 w-4" />
                  <span className="text-sm">Não atribuído</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Due Date */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Data de Entrega
              </p>
              {task.dueDate ? (
                <div className={`flex items-center gap-2 ${isOverdue ? "text-destructive" : ""}`}>
                  {isOverdue ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <Calendar className="h-4 w-4" />
                  )}
                  <span className="text-sm">
                    {format(new Date(task.dueDate), "dd 'de' MMMM, yyyy", {
                      locale: ptBR,
                    })}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm">Sem prazo definido</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Workflow Visualization */}
        {allTemplateStages.length > 0 && (
          <StageWorkflowVisualization
            currentStageId={task.currentStageId}
            allStages={allTemplateStages}
            stageLogs={task.stageLogs}
          />
        )}
      </div>
    </div>
  );
}
