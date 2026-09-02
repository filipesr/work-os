"use client";

import { useTranslations } from "next-intl";
import { AdvanceStageButton } from "@/components/tasks/AdvanceStageButton";
import { UnassignActiveStageButton } from "@/components/tasks/UnassignActiveStageButton";

/** Forma mínima que cada bloco precisa de uma `TaskActiveStage` ACTIVE ou BLOCKED. */
export interface AdminActiveStageRow {
  id: string;
  stageId: string;
  status: "ACTIVE" | "BLOCKED" | "COMPLETED" | "INACTIVE";
  stage: { name: string; order: number; template: { name: string } };
  assignee: { name: string | null; email: string | null } | null;
}

interface AdminTaskStagesProps {
  taskId: string;
  /** `task.activeStages` já vem filtrada pelo servidor para status ACTIVE/BLOCKED — não uma
   *  etapa só, escolhida por `currentStageId`. Fork/join deixa mais de uma nesse estado ao
   *  mesmo tempo, e cada uma precisa das PRÓPRIAS ações. */
  stages: AdminActiveStageRow[];
}

/**
 * Task 10: o admin parava de adivinhar "a" etapa atual — o mesmo defeito que a Task 9 corrigiu
 * na tela da própria etapa. Aqui a lista inteira de etapas ativas/bloqueadas ganha um bloco cada,
 * com o nome da etapa ao lado das ações QUE SÃO DELA.
 *
 * O portão de cada botão espelha o guarda do SERVIDOR daquele botão: avançar/desatribuir só sob
 * ACTIVE (`completeStageAndAdvance`/`unassignActiveStage` recusam fora disso).
 *
 * Fix round 1: `RevertStageButton` NÃO mora aqui. Ele recebe só `taskId` + `previousStages` —
 * nenhum `stageId` — porque `revertTaskStage` é ação de DEMANDA (olha para todas as etapas ativas
 * de uma vez, não a que está sendo desenhada neste bloco). Repeti-lo por etapa produziria cópias
 * idênticas que não sabem em que bloco estão, e sugeririam (falsamente) que cada uma reverte "a
 * sua" etapa. Ele vive junto do `CompleteTaskButton`, no cabeçalho do `SectionCard` da página —
 * ambos são poderes de nível demanda.
 */
export function AdminTaskStages({ taskId, stages }: AdminTaskStagesProps) {
  const t = useTranslations("admin.tasks.detail");

  if (stages.length === 0) {
    return <p className="text-muted-foreground">{t("noCurrentStage")}</p>;
  }

  return (
    <div className="space-y-4">
      {stages.map((s) => {
        const podeAvancar = s.status === "ACTIVE";
        const responsible = s.assignee?.name || s.assignee?.email || null;

        return (
          <div key={s.id} className="border-2 border-primary/20 bg-primary/5 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold">
                {s.stage.order}
              </span>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">{s.stage.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("template")} {s.stage.template.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {responsible ? `${t("assignee")}: ${responsible}` : t("unassigned")}
                </p>
              </div>
            </div>

            <div className="mt-3 flex gap-2 flex-wrap">
              {podeAvancar && (
                <div data-testid="advance-stage">
                  <AdvanceStageButton taskId={taskId} currentStageId={s.stageId} />
                </div>
              )}
              {podeAvancar && (
                <UnassignActiveStageButton
                  taskId={taskId}
                  stageId={s.stageId}
                  currentAssignee={responsible}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
