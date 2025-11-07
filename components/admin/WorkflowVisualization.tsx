"use client";

import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslations } from "next-intl";

interface Stage {
  id: string;
  name: string;
  order: number;
  defaultTeamId: string | null;
  defaultTeam: { id: string; name: string } | null;
  dependents: Array<{
    id: string;
    stageId: string;
    stage: { id: string; name: string; order: number };
    dependsOnStageId: string;
    dependsOn: { id: string; name: string; order: number };
  }>;
}

interface WorkflowVisualizationProps {
  stages: any[]; // Using any temporarily to bypass type checking
}

// Helper function to group stages by their dependency level
function groupStagesByLevel(stages: Stage[]): Stage[][] {
  if (stages.length === 0) return [];

  const levels: Stage[][] = [];
  const processedStages = new Set<string>();

  // Find stages with no dependencies (level 0)
  const noDeps = stages.filter(s => s.dependents.length === 0);
  if (noDeps.length > 0) {
    levels.push(noDeps);
    noDeps.forEach(s => processedStages.add(s.id));
  }

  // Process remaining stages level by level
  let currentLevel = 0;
  while (processedStages.size < stages.length && currentLevel < 20) {
    const nextLevel: Stage[] = [];

    for (const stage of stages) {
      if (processedStages.has(stage.id)) continue;

      // Check if all dependencies are in processed stages
      const allDepsProcessed = stage.dependents.every(dep =>
        processedStages.has(dep.dependsOnStageId)
      );

      if (allDepsProcessed) {
        nextLevel.push(stage);
      }
    }

    if (nextLevel.length === 0) {
      // No more stages can be processed, add remaining stages as a final level
      const remaining = stages.filter(s => !processedStages.has(s.id));
      if (remaining.length > 0) {
        levels.push(remaining);
        remaining.forEach(s => processedStages.add(s.id));
      }
      break;
    }

    levels.push(nextLevel);
    nextLevel.forEach(s => processedStages.add(s.id));
    currentLevel++;
  }

  return levels;
}

export function WorkflowVisualization({ stages }: WorkflowVisualizationProps) {
  const t = useTranslations("template.visualization");

  if (stages.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        {t("empty")}
      </div>
    );
  }

  const levels = groupStagesByLevel(stages);

  return (
    <div className="bg-muted/30 rounded-lg p-6 border-2 border-border">
      <h3 className="text-lg font-bold text-foreground mb-4">{t("title")}</h3>
      <p className="text-sm text-muted-foreground mb-6">
        {t("subtitle")}
      </p>

      <div className="flex flex-col space-y-4">
        {levels.map((level, levelIndex) => (
          <div key={levelIndex}>
            {/* Stages in this level (can happen in parallel) */}
            <div className="flex items-center gap-4 flex-wrap">
              {level.length > 1 && (
                <div className="w-full mb-2">
                  <Badge variant="secondary" className="text-xs">
                    {t("parallelExecution", { count: level.length })}
                  </Badge>
                </div>
              )}

              <div className={`flex items-center gap-4 flex-wrap ${level.length > 1 ? 'pl-4' : ''}`}>
                {level.map((stage, stageIndex) => (
                  <div key={stage.id} className="flex items-center gap-4">
                    {/* Stage Card */}
                    <div className="bg-card border-2 border-primary/30 rounded-lg p-4 min-w-[200px] shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-bold text-xs">
                          {stage.order}
                        </span>
                        <h4 className="font-bold text-foreground text-sm">{stage.name}</h4>
                      </div>

                      {stage.defaultTeam && (
                        <p className="text-xs text-muted-foreground">
                          {t("team")} {stage.defaultTeam.name}
                        </p>
                      )}

                      {stage.dependents.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border">
                          <p className="text-xs text-muted-foreground">
                            {t("requires")}{" "}
                            {stage.dependents
                              .map(d => d.dependsOn.name)
                              .join(", ")}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Separator between parallel stages */}
                    {level.length > 1 && stageIndex < level.length - 1 && (
                      <div className="text-muted-foreground">
                        <span className="text-xs font-semibold">{t("or")}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Arrow to next level */}
            {levelIndex < levels.length - 1 && (
              <div className="flex justify-center py-2">
                <div className="flex flex-col items-center">
                  <div className="w-0.5 h-8 bg-primary"></div>
                  <ArrowRight className="h-5 w-5 text-primary rotate-90" />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-6 border-t-2 border-border">
        <h4 className="text-sm font-semibold text-foreground mb-3">{t("legendTitle")}</h4>
        <div className="space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-primary/10 border border-primary/30"></div>
            <span>{t("legendStage")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs h-5">{t("parallelExecution", { count: 2 })}</Badge>
            <span>{t("legendParallel")}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-3 bg-primary"></div>
              <ArrowRight className="h-3 w-3 text-primary rotate-90" />
            </div>
            <span>{t("legendFlow")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
