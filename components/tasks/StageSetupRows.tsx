"use client";

import { useTranslations } from "next-intl";
import { StageAssigneeSelect } from "@/components/ui/StageAssigneeSelect";
import { Textarea } from "@/components/ui/textarea";

/** Lista de etapas com a configuração por etapa: inclusão (opcionais),
 *  roteamento (coringa), responsável e instrução.
 *
 *  Vive em um componente só porque as DUAS telas que a usam — criar demanda e
 *  corrigir demanda ainda não iniciada — precisam ser a mesma coisa. Duplicar o
 *  bloco garantiria que a segunda divergisse da primeira na primeira mudança.
 *
 *  Os campos mantêm os mesmos `name` nos dois casos (`stage:`, `team:`,
 *  `assignee:`, `instructions:`), então ambas postam via FormData e são lidas
 *  pelos mesmos parsers em `lib/stage-assignment-helpers.ts`.
 */

type Member = { id: string; name: string | null; email: string | null };

export type StageSetupStage = {
  id: string;
  name: string;
  order: number;
  optional: boolean;
  defaultTeam: { id: string; name: string; members: Member[] } | null;
};

export type StageSetupTeam = { id: string; name: string; members: Member[] };

export function StageSetupRows({
  stages,
  teams,
  checkedStages,
  onToggleStage,
  stageTeams,
  onTeamChange,
  onAssigneeChange,
  assigneeDefaults = {},
  instructionsDefaults = {},
  entryStageId,
}: {
  stages: StageSetupStage[];
  teams: StageSetupTeam[];
  checkedStages: Record<string, boolean>;
  onToggleStage: (stageId: string, checked: boolean) => void;
  /** { stageId: teamId } escolhido para as etapas coringa. */
  stageTeams: Record<string, string>;
  onTeamChange: (stageId: string, teamId: string) => void;
  onAssigneeChange?: (stageId: string, userId: string) => void;
  /** Pré-preenchimento (modo edição): responsável já gravado por etapa. */
  assigneeDefaults?: Record<string, string>;
  instructionsDefaults?: Record<string, string>;
  /** Etapa de entrada derivada (menor ordem incluída), para o selo. */
  entryStageId: string | null;
}) {
  const t = useTranslations("tasks");

  return (
    <ol className="divide-y divide-border">
      {stages.map((stage, index) => {
        const isChecked = checkedStages[stage.id] ?? !stage.optional;
        const isEntry = stage.id === entryStageId;
        // Coringa = o template deixou a etapa sem time padrão. É uma decisão do
        // template ("este passo existe, quem faz depende da demanda"), não uma
        // configuração faltando.
        const isFlexible = !stage.defaultTeam;
        const chosenTeam = isFlexible
          ? (teams.find((tm) => tm.id === stageTeams[stage.id]) ?? null)
          : null;
        const dimmed = stage.optional && !isChecked;

        return (
          <li
            key={stage.id}
            className={`grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_14rem] ${
              isFlexible ? "sm:items-start" : "sm:items-center"
            } ${dimmed ? "opacity-60" : ""}`}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{stage.name}</span>
                  {stage.optional && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {t("create.optionalBadge")}
                    </span>
                  )}
                  {isFlexible && (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                      {t("create.flexibleBadge")}
                    </span>
                  )}
                  {isEntry && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {t("create.entryBadge")}
                    </span>
                  )}
                </div>
                {stage.optional ? (
                  <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
                    <input
                      type="checkbox"
                      name={`stage:${stage.id}`}
                      checked={isChecked}
                      onChange={(e) => onToggleStage(stage.id, e.target.checked)}
                      className="h-4 w-4 shrink-0 accent-primary"
                      aria-label={stage.name}
                    />
                    {t("create.includeStage")}
                  </label>
                ) : (
                  <input type="hidden" name={`stage:${stage.id}`} value="on" />
                )}
              </div>
            </div>

            <div className="space-y-3">
              {/* Etapa coringa: o template não nomeia o time, então o roteamento
                  é escolhido aqui. Sem isto a etapa nasce fora da fila de todos
                  os times — invisível para quem poderia executá-la. */}
              {isFlexible && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {t("create.teamLabel")}
                  </p>
                  <select
                    name={`team:${stage.id}`}
                    value={chosenTeam?.id ?? ""}
                    disabled={!isChecked}
                    aria-label={t("create.teamAriaLabel", { stage: stage.name })}
                    onChange={(e) => onTeamChange(stage.id, e.target.value)}
                    className="h-9 w-full rounded-md border border-input-border bg-input px-2 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-muted/50 disabled:opacity-60"
                  >
                    <option value="">{t("create.teamPlaceholder")}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("create.responsibleLabel")}
                </p>
                {isFlexible && !chosenTeam ? (
                  <p className="text-xs text-muted-foreground">{t("create.chooseTeamFirst")}</p>
                ) : (
                  <StageAssigneeSelect
                    // Remonta ao trocar de time: sem isto o <select>
                    // não-controlado guardaria o responsável antigo.
                    key={chosenTeam?.id ?? "default"}
                    stageId={stage.id}
                    teamName={chosenTeam?.name ?? stage.defaultTeam?.name ?? null}
                    members={chosenTeam?.members ?? stage.defaultTeam?.members ?? []}
                    defaultValue={assigneeDefaults[stage.id] ?? ""}
                    className="w-full"
                    disabled={!isChecked}
                    onChange={(v: string) => onAssigneeChange?.(stage.id, v)}
                  />
                )}
              </div>
            </div>

            {/* "Apoio" não diz nada sozinho: numa etapa coringa, quem pega
                precisa ler o que exatamente é para fazer. */}
            {isFlexible && (
              <div className="sm:col-span-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t("create.instructionsLabel")}
                </p>
                <Textarea
                  name={`instructions:${stage.id}`}
                  rows={2}
                  defaultValue={instructionsDefaults[stage.id] ?? ""}
                  disabled={!isChecked}
                  placeholder={t("create.instructionsPlaceholder")}
                  aria-label={t("create.instructionsAriaLabel", { stage: stage.name })}
                />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
