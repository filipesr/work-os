"use client";

import { useTranslations, useLocale } from "next-intl";
import { format } from "date-fns";
import { Calendar, User as UserIcon, MessageSquare, Paperclip } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Separator } from "@/components/ui/separator";
import { stageStatusTone } from "@/lib/status-tone";
import { dateFnsLocale } from "@/lib/date-locale";
import { CommentsList } from "./CommentsList";
import { AddCommentForm } from "./AddCommentForm";
import { ActivityButton } from "./ActivityButton";
import { LogTimeButton } from "./LogTimeButton";
import { AdvanceStageButton } from "./AdvanceStageButton";
import { RevertStageButton } from "./RevertStageButton";
import { UnassignActiveStageButton } from "./UnassignActiveStageButton";
import { UnifiedArtifactsPanel } from "@/components/artifacts/UnifiedArtifactsPanel";
import type { StageView } from "@/lib/actions/stage-view";

interface StageWorkViewProps {
  view: StageView;
  currentUserId: string;
}

/**
 * A tela de uma etapa: identidade da demanda e da etapa no cabeçalho, a instrução da etapa em
 * destaque (quando ela existe), as AÇÕES desta etapa (Task 9 — antes moravam na tela da demanda,
 * que tinha de adivinhar qual etapa ativa operar sob fork/join) e a conversa da DEMANDA com o
 * bloco desta etapa realçado.
 *
 * A conversa nunca é filtrada pela etapa — só realçada. Quem opera precisa do contexto do que já
 * foi dito nas etapas anteriores; filtrar tiraria exatamente esse contexto.
 */
export function StageWorkView({ view, currentUserId }: StageWorkViewProps) {
  const t = useTranslations("tasks");
  const tDetail = useTranslations("tasks.detail");
  const tStages = useTranslations("tasks.stages");
  const tComments = useTranslations("tasks.comments");
  const tArtifacts = useTranslations("tasks.artifacts");
  const locale = useLocale();
  const { stage, task, comments, previousStages, activeLog, artifactRows, canManageScoped } = view;

  const stageStatusLabels: Record<StageView["stage"]["status"], string> = {
    INACTIVE: tStages("pending"),
    ACTIVE: tStages("active"),
    BLOCKED: tStages("blocked"),
    COMPLETED: tStages("completed"),
  };

  // O portão da TELA acompanha o guarda do SERVIDOR no que diz respeito ao STATUS da etapa: é aí
  // que os dois lados podem divergir por engano, e divergir esconde função que a pessoa tinha
  // antes (foi o que aconteceu com `logTime` e com anexar artefato).
  //
  // No que diz respeito ao PAPEL, porém, o portão da tela é declaradamente MAIS LARGO: o servidor
  // exige `isAdmin || isManager || isAssignee` em `completeStageAndAdvance`, `unassignActiveStage`
  // e `revertTaskStage`, e `canPerformActions` (ver `stage-view.ts`) inclui também SUPERVISOR. Um
  // supervisor que não seja o responsável vê esses três botões e recebe recusa do servidor ao
  // clicar. Fica registrado como é, e não como se gostaria que fosse: apertar o portão da tela
  // esconderia botão de quem talvez devesse tê-lo, e afrouxar o servidor mudaria a regra — as
  // duas coisas são decisão de produto, não conserto de comentário.
  //
  // Avançar/desatribuir: o servidor só aceita `stageId` (TemplateStage) de uma `TaskActiveStage`
  // ACTIVE (`completeStageAndAdvance`/`unassignActiveStage` recusam fora disso).
  const podeAvancar = stage.status === "ACTIVE" && stage.canPerformActions;
  // Reverter: `revertTaskStage` aceita a demanda ter etapa ACTIVE **ou** BLOCKED (o guarda olha
  // para TODAS as etapas ativas da demanda, não só esta) — exigir ACTIVE aqui escondia o botão
  // numa demanda travada em BLOCKED, mesmo com o servidor pronto para aceitar a reversão.
  const podeReverter =
    (stage.status === "ACTIVE" || stage.status === "BLOCKED") && stage.canPerformActions;
  // Apontar hora: `logTime` só exige `requireMemberOrHigher` — nem status de etapa, nem ser o
  // responsável por ELA. Prender ao status ACTIVE tirava de um gestor o único caminho de lançar
  // (ou corrigir) hora numa demanda já concluída — perda de função, não reforço de regra.
  const podeApontarHora = stage.canPerformActions;
  // Anexar artefato: `prepareArtifactUpload` só exige `requireMemberOrHigher` — mesmo caso do
  // apontamento de hora, e o mesmo defeito. Preso ao ACTIVE, um SUPERVISOR ficava sem NENHUM
  // caminho para anexar numa demanda sem etapa ativa: `/tasks/{id}` passou a mandar `canAdd`
  // falso e `/admin/tasks/{id}` é MANAGER+. A entrega tirava um poder que ninguém pediu para
  // tirar.
  const podeAnexar = stage.canPerformActions;
  const mostraAcoes = podeAvancar || podeApontarHora;

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

        {/* As ações desta etapa (Task 9). `templateStageId` — não `activeStageId` — é o que as
            Server Actions por trás destes botões esperam como "stageId" (ver stage-view.ts). Cada
            bloco só monta sob o portão que espelha o guarda do SERVIDOR daquele botão específico
            (ver os `pode*` acima) — não um portão único para a seção inteira. */}
        {mostraAcoes && (
          <SectionCard title={tDetail("actionsTitle")} bodyClassName="p-6">
            <div data-testid="stage-actions" className="space-y-3">
              {podeAvancar && (
                <>
                  <div data-testid="activity-button">
                    <ActivityButton
                      taskId={task.id}
                      taskTitle={task.title}
                      currentStageId={stage.templateStageId}
                      activeLog={activeLog}
                    />
                  </div>
                  <Separator />
                  <div data-testid="advance-stage">
                    <AdvanceStageButton taskId={task.id} currentStageId={stage.templateStageId} />
                  </div>
                  <UnassignActiveStageButton
                    taskId={task.id}
                    stageId={stage.templateStageId}
                    currentAssignee={stage.assignee?.name ?? null}
                  />
                </>
              )}
              {podeApontarHora && (
                <>
                  <Separator />
                  <div data-testid="log-time">
                    <LogTimeButton taskId={task.id} activeStageId={stage.activeStageId} />
                  </div>
                </>
              )}
            </div>
          </SectionCard>
        )}

        {/* Reverter é poder da DEMANDA, não desta etapa, e por isso mora fora do card acima —
            do mesmo jeito que `/admin/tasks/{id}` o tirou da lista por etapa e o pôs junto do
            `CompleteTaskButton`. `revertTaskStage` olha TODAS as etapas ativas da demanda de uma
            vez: sob fork/join, reverter daqui derruba também a etapa paralela que quem clicou
            nem está vendo. Dentro do bloco da etapa o botão prometia "reverter esta etapa" — uma
            promessa que a action não cumpre. O subtítulo diz isso em palavras. */}
        {podeReverter && (
          <SectionCard
            title={t("stageView.demandActionsTitle")}
            subtitle={t("stageView.revertScopeHint")}
            bodyClassName="p-6"
          >
            <div data-testid="demand-actions">
              <RevertStageButton taskId={task.id} previousStages={previousStages} />
            </div>
          </SectionCard>
        )}

        {/* A conversa INTEIRA da demanda — `highlightStageId` só realça, nunca filtra. */}
        <SectionCard title={tComments("title")} icon={MessageSquare} bodyClassName="space-y-4 p-6">
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

          {/* A caixa aparece qualquer que seja o status da etapa. A regra anterior ("etapa
              concluída é leitura") não veio da spec e cobrava caro: numa demanda terminada TODAS
              as etapas estão COMPLETED, e como `/tasks/{id}` virou leitura e `/admin/tasks/{id}`
              é MANAGER+, MEMBER e SUPERVISOR ficavam sem nenhum lugar para escrever — enquanto
              `addComment` exige apenas MEMBER+. Conversa não fecha junto com a etapa. */}
          <div data-testid="add-comment">
            <AddCommentForm
              taskId={task.id}
              userId={currentUserId}
              activeStageId={stage.activeStageId}
            />
          </div>
        </SectionCard>

        {/* Painel de artefatos operando A PARTIR DA ETAPA (Task 9) — a tela da demanda mantém o
            mesmo painel, mas só em leitura (`canAdd`/`canRemove` sempre `false` lá). */}
        <SectionCard title={tArtifacts("title")} icon={Paperclip} bodyClassName="p-6">
          <UnifiedArtifactsPanel
            rows={artifactRows}
            scope="TASK"
            ownerIds={{ taskId: task.id, projectId: task.projectId, clientId: task.clientId }}
            currentTaskId={task.id}
            canAdd={podeAnexar}
            canRemove={canManageScoped}
          />
        </SectionCard>
      </div>
    </div>
  );
}
