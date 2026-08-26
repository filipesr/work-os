"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Save, Lock } from "lucide-react";
import { updateTaskStageSetup } from "@/lib/actions/task-stage-setup";
import { useServerAction } from "@/lib/hooks/useServerAction";
import { firstIncludedStageId } from "@/lib/forecast-feasibility";
import {
  StageSetupRows,
  type StageSetupStage,
  type StageSetupTeam,
} from "@/components/tasks/StageSetupRows";
import type { VirginBlocker } from "@/lib/task-virgin";

/** Corrigir o desenho de uma demanda que ainda não começou.
 *
 *  Mesma lista de etapas do formulário de criação (`StageSetupRows`), porque é a
 *  mesma decisão — só tomada depois, quando o gestor percebeu que roteou errado
 *  ou esqueceu de incluir uma etapa opcional. Quando a janela fecha, o card
 *  continua visível mas explica POR QUE travou: sumir seria deixar o gestor
 *  procurando um botão que não existe mais.
 */
export function TaskStageSetupEditor({
  taskId,
  stages,
  teams,
  currentSetup,
  blocker,
}: {
  taskId: string;
  stages: StageSetupStage[];
  teams: StageSetupTeam[];
  currentSetup: {
    includedStageIds: string[];
    teamByStage: Record<string, string>;
    assigneeByStage: Record<string, string>;
    instructionsByStage: Record<string, string>;
  };
  /** Null = ainda editável. Caso contrário, o motivo do bloqueio. */
  blocker: VirginBlocker | null;
}) {
  const t = useTranslations("tasks.stageSetup");
  const router = useRouter();

  const included = new Set(currentSetup.includedStageIds);
  const [checkedStages, setCheckedStages] = useState<Record<string, boolean>>(
    Object.fromEntries(stages.map((s) => [s.id, included.has(s.id)]))
  );
  const [stageTeams, setStageTeams] = useState<Record<string, string>>(currentSetup.teamByStage);
  const [assigneeOverrides, setAssigneeOverrides] = useState<Record<string, string>>({});

  const { run, isPending } = useServerAction(updateTaskStageSetup, {
    successMessage: t("saved"),
    onSuccess: () => router.refresh(),
  });

  const entryStageId = firstIncludedStageId(stages, checkedStages);

  if (blocker) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">{t("lockedTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t(`locked.${blocker}`)}</p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(new FormData(e.currentTarget));
      }}
    >
      <input type="hidden" name="taskId" value={taskId} />
      <p className="mb-4 text-sm text-muted-foreground">{t("intro")}</p>

      <StageSetupRows
        stages={stages}
        teams={teams}
        checkedStages={checkedStages}
        onToggleStage={(stageId, checked) =>
          setCheckedStages((prev) => ({ ...prev, [stageId]: checked }))
        }
        stageTeams={stageTeams}
        onTeamChange={(stageId, teamId) => {
          setStageTeams((prev) => ({ ...prev, [stageId]: teamId }));
          // Trocar de time invalida quem já estava escolhido: a pessoa pode não
          // pertencer ao time novo.
          setAssigneeOverrides((prev) => ({ ...prev, [stageId]: "" }));
        }}
        assigneeDefaults={{ ...currentSetup.assigneeByStage, ...assigneeOverrides }}
        instructionsDefaults={currentSetup.instructionsByStage}
        entryStageId={entryStageId}
      />

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">{t("windowNote")}</p>
        <button
          type="submit"
          disabled={isPending}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("save")}
        </button>
      </div>
    </form>
  );
}
