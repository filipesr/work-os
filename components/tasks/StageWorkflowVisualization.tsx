"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock, ArrowRight } from "lucide-react";
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";

interface StageLog {
  id: string;
  enteredAt: Date;
  exitedAt: Date | null;
  status: "COMPLETED" | "REVERTED" | null;
  stage: {
    id: string;
    name: string;
    order: number;
  };
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

interface TemplateStage {
  id: string;
  name: string;
  order: number;
  defaultTeam: {
    id: string;
    name: string;
  } | null;
}

interface StageWorkflowVisualizationProps {
  currentStageId: string | null;
  allStages: TemplateStage[];
  stageLogs: StageLog[];
}

export function StageWorkflowVisualization({
  currentStageId,
  allStages,
  stageLogs,
}: StageWorkflowVisualizationProps) {
  // Get completed stage IDs
  const completedStageIds = new Set(
    stageLogs.filter((log) => log.exitedAt !== null).map((log) => log.stage.id)
  );

  // Find current stage index
  const currentStageIndex = allStages.findIndex(
    (stage) => stage.id === currentStageId
  );

  // Calculate duration for completed stages
  const getStageDuration = (stageId: string): string | null => {
    const log = stageLogs.find(
      (log) => log.stage.id === stageId && log.exitedAt !== null
    );
    if (!log || !log.exitedAt) return null;

    const hours = differenceInHours(
      new Date(log.exitedAt),
      new Date(log.enteredAt)
    );
    
    if (hours < 1) return "< 1h";
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  };

  const getStageLog = (stageId: string) => {
    return stageLogs.find((log) => log.stage.id === stageId);
  };

  const getStageStatus = (stage: TemplateStage, index: number) => {
    if (stage.id === currentStageId) return "current";
    if (index < currentStageIndex) return "completed";
    return "upcoming";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Fluxo de Trabalho</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {allStages.map((stage, index) => {
            const status = getStageStatus(stage, index);
            const log = getStageLog(stage.id);
            const duration = getStageDuration(stage.id);
            const isLast = index === allStages.length - 1;

            return (
              <div key={stage.id}>
                <div
                  className={`relative flex items-start gap-3 p-3 rounded-lg transition-colors ${
                    status === "current"
                      ? "bg-blue-50 border-2 border-blue-300"
                      : status === "completed"
                      ? "bg-green-50"
                      : "bg-gray-50"
                  }`}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {status === "completed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : status === "current" ? (
                      <Clock className="h-5 w-5 text-blue-600 animate-pulse" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className={`text-xs ${
                          status === "current"
                            ? "border-blue-600 text-blue-700 bg-blue-100"
                            : status === "completed"
                            ? "border-green-600 text-green-700 bg-green-100"
                            : "border-gray-400 text-gray-600"
                        }`}
                      >
                        {stage.order}
                      </Badge>
                      <span
                        className={`font-medium text-sm ${
                          status === "current"
                            ? "text-blue-900"
                            : status === "completed"
                            ? "text-green-900"
                            : "text-gray-700"
                        }`}
                      >
                        {stage.name}
                      </span>
                      {status === "current" && (
                        <Badge className="bg-blue-600 text-white text-xs">
                          Atual
                        </Badge>
                      )}
                    </div>

                    {/* Completed stage info */}
                    {status === "completed" && log && log.exitedAt && (
                      <div className="text-xs text-green-700 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {log.user.name || log.user.email}
                          </span>
                          {duration && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{duration}</span>
                            </>
                          )}
                        </div>
                        <div className="text-gray-600">
                          Concluído em{" "}
                          {format(new Date(log.exitedAt), "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </div>
                      </div>
                    )}

                    {/* Current stage info */}
                    {status === "current" && log && (
                      <div className="text-xs text-blue-700">
                        <div>
                          Iniciado em{" "}
                          {format(new Date(log.enteredAt), "dd/MM/yyyy HH:mm", {
                            locale: ptBR,
                          })}
                        </div>
                      </div>
                    )}

                    {/* Upcoming stage info */}
                    {status === "upcoming" && stage.defaultTeam && (
                      <div className="text-xs text-gray-600">
                        Time: {stage.defaultTeam.name}
                      </div>
                    )}
                  </div>
                </div>

                {/* Arrow connector */}
                {!isLast && (
                  <div className="flex justify-center py-1">
                    <ArrowRight
                      className={`h-4 w-4 ${
                        status === "completed"
                          ? "text-green-500"
                          : "text-gray-300"
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className="font-semibold text-green-700">
                {Array.from(completedStageIds).length}
              </div>
              <div className="text-gray-600">Concluídas</div>
            </div>
            <div>
              <div className="font-semibold text-blue-700">
                {currentStageId ? 1 : 0}
              </div>
              <div className="text-gray-600">Em andamento</div>
            </div>
            <div>
              <div className="font-semibold text-gray-700">
                {allStages.length -
                  Array.from(completedStageIds).length -
                  (currentStageId ? 1 : 0)}
              </div>
              <div className="text-gray-600">Pendentes</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}