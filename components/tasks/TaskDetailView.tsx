"use client";

import Link from "next/link";
import { Task, User, Project, Client, TemplateStage, Team, TaskComment, TaskArtifact, TaskStageLog } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Calendar, User as UserIcon, AlertCircle } from "lucide-react";
import { ActivityFeed } from "./ActivityFeed";
import { AddCommentForm } from "./AddCommentForm";
import { AddArtifactForm } from "./AddArtifactForm";
import { AdvanceStageButton } from "./AdvanceStageButton";
import { RevertStageButton } from "./RevertStageButton";
import { LogTimeButton } from "./LogTimeButton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type TaskWithRelations = Task & {
  project: Project & { client: Client };
  assignee: Pick<User, "id" | "name" | "email" | "image" | "teamId"> | null;
  currentStage: (TemplateStage & { defaultTeam: Team | null; template: { id: string; name: string } }) | null;
  comments: (TaskComment & { user: Pick<User, "id" | "name" | "email" | "image"> })[];
  artifacts: (TaskArtifact & { user: Pick<User, "id" | "name" | "email" | "image"> })[];
  stageLogs: (TaskStageLog & {
    stage: TemplateStage;
    user: Pick<User, "id" | "name" | "email" | "image">;
  })[];
};

interface TaskDetailViewProps {
  task: TaskWithRelations;
  availableNextStages: TemplateStage[];
  previousStages: TemplateStage[];
  currentUserId: string;
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

        {/* Activity Feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Atividades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Add Comment Form */}
            <AddCommentForm taskId={task.id} userId={currentUserId} />

            <Separator />

            {/* Add Artifact Form */}
            <AddArtifactForm taskId={task.id} userId={currentUserId} />

            <Separator />

            {/* Unified Activity Feed */}
            <ActivityFeed
              comments={task.comments}
              artifacts={task.artifacts}
            />
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

                {/* State Machine Controls */}
                <div className="flex flex-col gap-2">
                  <AdvanceStageButton
                    taskId={task.id}
                    availableStages={availableNextStages}
                  />
                  <RevertStageButton
                    taskId={task.id}
                    previousStages={previousStages}
                  />
                </div>

                <Separator />

                {/* Time Logging */}
                <div>
                  <LogTimeButton taskId={task.id} />
                </div>
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

        {/* Stage History */}
        {task.stageLogs.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Histórico de Etapas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {task.stageLogs.map((log) => (
                  <div
                    key={log.id}
                    className="text-sm border-l-2 border-primary pl-3 py-1"
                  >
                    <p className="font-medium">{log.stage.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.user.name || log.user.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(log.enteredAt), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
