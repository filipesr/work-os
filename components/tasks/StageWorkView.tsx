"use client";

import { useTranslations, useLocale } from "next-intl";
import { format } from "date-fns";
import { Calendar, User as UserIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { stageStatusTone } from "@/lib/status-tone";
import { dateFnsLocale } from "@/lib/date-locale";
import { CommentsList } from "./CommentsList";
import { AddCommentForm } from "./AddCommentForm";
import type { StageView } from "@/lib/actions/stage-view";

interface StageWorkViewProps {
  view: StageView;
  currentUserId: string;
}

/**
 * A tela de uma etapa: identidade da demanda e da etapa no cabeçalho, a instrução da etapa em
 * destaque (quando ela existe) e a conversa da DEMANDA com o bloco desta etapa realçado.
 *
 * A conversa nunca é filtrada pela etapa — só realçada. Quem opera precisa do contexto do que já
 * foi dito nas etapas anteriores; filtrar tiraria exatamente esse contexto.
 */
export function StageWorkView({ view, currentUserId }: StageWorkViewProps) {
  const t = useTranslations("tasks");
  const tDetail = useTranslations("tasks.detail");
  const tStages = useTranslations("tasks.stages");
  const tComments = useTranslations("tasks.comments");
  const locale = useLocale();
  const { stage, task, comments } = view;

  const stageStatusLabels: Record<StageView["stage"]["status"], string> = {
    INACTIVE: tStages("pending"),
    ACTIVE: tStages("active"),
    BLOCKED: tStages("blocked"),
    COMPLETED: tStages("completed"),
  };

  return (
    <div data-testid="stage-work-view" className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={tDetail("kicker")}
        title={task.title}
        subtitle={`${task.clientName} · ${task.projectName}`}
        backHref={`/tasks/${task.id}`}
        backLabel={t("stageView.backToDemand")}
        actions={
          <StatusBadge
            tone={stageStatusTone(stage.status)}
            label={`${stage.order} · ${stage.name} · ${stageStatusLabels[stage.status]}`}
          />
        }
      />

      <div className="space-y-6">
        {/* Identidade da etapa: quem está com ela e o prazo da demanda que a carrega. */}
        <SectionCard title={tDetail("taskDetails")} bodyClassName="grid grid-cols-2 gap-4 p-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {tDetail("dueDate")}
            </p>
            {task.dueDate ? (
              <div className="mt-1 flex items-center gap-2 text-sm text-foreground">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>
                  {format(new Date(task.dueDate), "dd/MM/yyyy", { locale: dateFnsLocale(locale) })}
                </span>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{tDetail("noDueDate")}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {tStages("assignedTo")}
            </p>
            {stage.assignee ? (
              <div className="mt-1 flex items-center gap-2 text-sm text-foreground">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <span>{stage.assignee.name}</span>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">{tStages("unassigned")}</p>
            )}
          </div>
        </SectionCard>

        {/* A instrução da etapa em destaque — entregue no momento da liberação, aqui é onde
            quem executa efetivamente a lê, e não só na hora de gerar a demanda. */}
        {stage.instruction && (
          <div
            data-testid="stage-instruction"
            className="rounded-lg border border-warning/30 bg-warning-subtle p-4"
          >
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">
              {t("stageView.instructionTitle")}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {stage.instruction}
            </p>
          </div>
        )}

        {/* A conversa INTEIRA da demanda — `highlightStageId` só realça, nunca filtra. */}
        <SectionCard title={tComments("title")} bodyClassName="space-y-4 p-6">
          <CommentsList
            comments={comments.map((c) => ({
              id: c.id,
              content: c.content,
              createdAt: c.createdAt,
              kind: c.kind,
              activeStageId: c.activeStageId,
              user: { id: c.author.id, name: c.author.name, email: null },
            }))}
            currentUserId={currentUserId}
            highlightStageId={stage.activeStageId}
          />

          {/* Etapa concluída é leitura: a conversa dela já aconteceu, não há o que escrever. */}
          {stage.status !== "COMPLETED" && (
            <div data-testid="add-comment">
              <AddCommentForm
                taskId={task.id}
                userId={currentUserId}
                activeStageId={stage.activeStageId}
              />
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
