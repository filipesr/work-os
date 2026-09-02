"use client";

import { useState } from "react";
import { TemplateStage, Team, TaskStageLog, TaskComment, TaskArtifact, User } from "@prisma/client";
import { History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CommentsList } from "./CommentsList";
import { ArtifactsList } from "./ArtifactsList";
import { format } from "date-fns";
import { useTranslations, useLocale } from "next-intl";
import { dateFnsLocale, atConnector } from "@/lib/date-locale";

interface WorkflowHistoryModalProps {
  allStages: (TemplateStage & { defaultTeam: { id: string; name: string } | null })[];
  stageLogs: (TaskStageLog & {
    stage: TemplateStage;
    user: Pick<User, "id" | "name" | "email" | "image">;
  })[];
  comments: (TaskComment & { user: Pick<User, "id" | "name" | "email" | "image"> })[];
  artifacts: (TaskArtifact & { user: Pick<User, "id" | "name" | "email" | "image"> })[];
  /** Linhas `TaskActiveStage` desta demanda (id + a etapa de template que executam). `allStages`/
   *  `stageLogs` falam a língua do TEMPLATE (`TemplateStage.id`); `TaskComment.activeStageId`
   *  aponta pra INSTÂNCIA (a linha desta demanda). Sem este mapa o componente teria que adivinhar
   *  de novo — a página já tem `task.activeStages` em mãos, então ela entrega pronto. */
  activeStages: { id: string; stageId: string }[];
  currentUserId: string;
  currentStageId: string | null;
}

export function WorkflowHistoryModal({
  allStages,
  stageLogs,
  comments,
  artifacts,
  activeStages,
  currentUserId,
  currentStageId,
}: WorkflowHistoryModalProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("tasks.workflowHistory");
  const locale = useLocale();

  // Etapa de template -> linha da demanda (`TaskActiveStage.id`). É essa linha, não o autor, que
  // liga um comentário à etapa (ver `TaskComment.activeStageId`).
  const activeStageIdByStageId = new Map(activeStages.map((as) => [as.stageId, as.id]));

  // Group comments and artifacts by stage
  const getStageContent = (stageId: string) => {
    const activeStageId = activeStageIdByStageId.get(stageId);
    // Pelo VÍNCULO, não pelo autor: `activeStageId` diz de qual etapa o comentário é. A versão
    // anterior perguntava "o autor passou por esta etapa?", o que repetia o mesmo comentário em
    // toda etapa por onde a pessoa passou e escondia o de quem nunca teve log — e ignorava a
    // data, então um comentário de hoje podia aparecer sob uma etapa fechada há meses.
    // `activeStageId: null` é comentário da DEMANDA (ex.: "o cliente adiou tudo"), não de etapa
    // nenhuma — corretamente ausente de todo bloco abaixo.
    const stageComments = comments.filter((c) => c.activeStageId === activeStageId);
    // Artefatos continuam pelo palpite de autor: não há coluna de etapa em `TaskArtifact` ainda,
    // então não há vínculo melhor para usar aqui (fora do escopo desta correção).
    const stageArtifacts = artifacts.filter((a) =>
      stageLogs.some((log) => log.stageId === stageId && log.userId === a.userId)
    );
    return { comments: stageComments, artifacts: stageArtifacts };
  };

  // Get unique completed stages from logs
  const completedStages = Array.from(
    new Set(
      stageLogs
        .filter((log) => log.exitedAt && log.stageId !== currentStageId)
        .map((log) => log.stageId)
    )
  )
    .map((stageId) => {
      const stage = allStages.find((s) => s.id === stageId);
      const logs = stageLogs.filter((log) => log.stageId === stageId);
      const { comments: stageComments, artifacts: stageArtifacts } = getStageContent(stageId);
      return { stage, logs, comments: stageComments, artifacts: stageArtifacts };
    })
    .filter((item) => item.stage);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title={t("tooltip")}>
          <History className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {completedStages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("noCompletedStages")}
            </p>
          ) : (
            completedStages.map(
              ({ stage, logs, comments: stageComments, artifacts: stageArtifacts }) => {
                if (!stage) return null;
                const lastLog = logs[logs.length - 1];

                return (
                  <div key={stage.id} className="border rounded-lg p-4 bg-muted/30">
                    {/* Stage Header */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted text-muted-foreground font-semibold">
                        {stage.order}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-base">{stage.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {lastLog?.exitedAt &&
                            t("completedOn", {
                              date: format(
                                new Date(lastLog.exitedAt),
                                `dd/MM/yyyy '${atConnector(locale)}' HH:mm`,
                                { locale: dateFnsLocale(locale) }
                              ),
                            })}
                        </p>
                        {stage.defaultTeam && (
                          <p className="text-xs text-muted-foreground">
                            {t("team", { name: stage.defaultTeam.name })}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {t("completedBadge")}
                      </Badge>
                    </div>

                    {/* Stage Content */}
                    {stageComments.length > 0 || stageArtifacts.length > 0 ? (
                      <div className="ml-13 space-y-4">
                        {/* Comments from this stage */}
                        {stageComments.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              {t("commentsCount", { count: stageComments.length })}
                            </p>
                            <CommentsList comments={stageComments} currentUserId={currentUserId} />
                          </div>
                        )}

                        {/* Artifacts from this stage */}
                        {stageArtifacts.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">
                              {t("artifactsCount", { count: stageArtifacts.length })}
                            </p>
                            <ArtifactsList artifacts={stageArtifacts} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground ml-13">{t("noContent")}</p>
                    )}
                  </div>
                );
              }
            )
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
