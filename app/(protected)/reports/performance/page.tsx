import { Suspense } from "react";
import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import {
  getAverageTimePerStage,
  getReworkRateByStage,
  getLeadTimeMetrics,
} from "@/lib/actions/reporting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  TrendingDown,
  AlertTriangle,
  Timer,
  Activity,
} from "lucide-react";

export default async function PerformanceReportPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  // Check authorization
  try {
    await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);
  } catch (error) {
    redirect("/auth/signin");
  }

  // Parse filter parameters
  const startDateStr = searchParams.startDate as string | undefined;
  const endDateStr = searchParams.endDate as string | undefined;

  const filters = {
    startDate: startDateStr ? new Date(startDateStr) : undefined,
    endDate: endDateStr ? new Date(endDateStr) : undefined,
  };

  // Fetch all report data
  const [averageTimePerStage, reworkRateByStage, leadTimeMetrics] =
    await Promise.all([
      getAverageTimePerStage(filters),
      getReworkRateByStage(filters),
      getLeadTimeMetrics(filters),
    ]);

  // Identify bottlenecks (stages with highest average time)
  const bottlenecks = averageTimePerStage.slice(0, 3);

  // Identify quality issues (stages with highest rework rate)
  const qualityIssues = reworkRateByStage.filter((s) => s.reworkRate > 0.1);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link
              href="/reports"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-3xl font-bold">
              Relatório de Desempenho e Gargalos
            </h1>
          </div>
          <p className="text-muted-foreground">
            Análise de fluxo de trabalho, identificação de gargalos e taxa de
            retrabalho
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="GET" className="flex gap-4 items-end">
            <div className="flex-1">
              <label
                htmlFor="startDate"
                className="text-sm font-medium block mb-2"
              >
                Data Início
              </label>
              <input
                type="date"
                id="startDate"
                name="startDate"
                defaultValue={startDateStr}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="endDate" className="text-sm font-medium block mb-2">
                Data Fim
              </label>
              <input
                type="date"
                id="endDate"
                name="endDate"
                defaultValue={endDateStr}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Filtrar
            </button>
            {(startDateStr || endDateStr) && (
              <Link
                href="/reports/performance"
                className="px-4 py-2 border rounded-md hover:bg-muted"
              >
                Limpar
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Lead Time Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-full">
                <Timer className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Lead Time Médio
                </p>
                <p className="text-2xl font-bold">
                  {leadTimeMetrics.averageLeadTimeDays.toFixed(1)} dias
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-full">
                <Activity className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Lead Time Mediano
                </p>
                <p className="text-2xl font-bold">
                  {leadTimeMetrics.medianLeadTimeDays.toFixed(1)} dias
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-full">
                <TrendingDown className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Tarefas Analisadas
                </p>
                <p className="text-2xl font-bold">{leadTimeMetrics.count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert for Bottlenecks */}
      {bottlenecks.length > 0 && (
        <Card className="border-orange-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              <CardTitle className="text-orange-500">
                Gargalos Identificados
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              As seguintes etapas estão consumindo mais tempo e podem estar causando
              atrasos no fluxo:
            </p>
            <div className="space-y-2">
              {bottlenecks.map((stage) => (
                <div
                  key={stage.stageId}
                  className="flex justify-between items-center p-3 bg-orange-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium">{stage.stageName}</div>
                    <div className="text-xs text-muted-foreground">
                      {stage.templateName} • {stage.count} ocorrências
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-orange-500">
                      {stage.averageDurationDays.toFixed(1)} dias
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {stage.averageDurationHours.toFixed(1)} horas
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Average Time per Stage */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5" />
              <CardTitle>Tempo Médio por Etapa</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {averageTimePerStage.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum dado de etapa encontrado
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 pb-2 border-b font-semibold text-sm">
                  <div className="col-span-2">Etapa</div>
                  <div className="text-right">Tempo Médio</div>
                </div>
                {averageTimePerStage.map((stage) => (
                  <div
                    key={stage.stageId}
                    className="grid grid-cols-3 gap-2 text-sm"
                  >
                    <div className="col-span-2">
                      <div className="font-medium truncate">{stage.stageName}</div>
                      <div className="text-xs text-muted-foreground">
                        {stage.templateName} • {stage.count}x
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">
                        {stage.averageDurationDays.toFixed(1)}d
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {stage.averageDurationHours.toFixed(0)}h
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rework Rate by Stage */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              <CardTitle>Taxa de Retrabalho por Etapa</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {reworkRateByStage.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum dado de retrabalho encontrado
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2 pb-2 border-b font-semibold text-sm">
                  <div className="col-span-2">Etapa</div>
                  <div className="text-center">Completo/Revertido</div>
                  <div className="text-right">Taxa</div>
                </div>
                {reworkRateByStage.map((stage) => {
                  const reworkPercentage = (stage.reworkRate * 100).toFixed(0);
                  const isHighRework = stage.reworkRate > 0.15;

                  return (
                    <div
                      key={stage.stageId}
                      className={`grid grid-cols-4 gap-2 text-sm p-2 rounded ${
                        isHighRework ? "bg-red-50" : ""
                      }`}
                    >
                      <div className="col-span-2">
                        <div className="font-medium truncate">
                          {stage.stageName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {stage.templateName}
                        </div>
                      </div>
                      <div className="text-center text-xs">
                        <div className="text-green-600">{stage.completed}</div>
                        <div className="text-red-600">{stage.reverted}</div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-bold ${
                            isHighRework ? "text-red-600" : "text-foreground"
                          }`}
                        >
                          {reworkPercentage}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quality Issues Alert */}
      {qualityIssues.length > 0 && (
        <Card className="border-red-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <CardTitle className="text-red-500">
                Atenção: Alta Taxa de Retrabalho
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              As seguintes etapas apresentam taxa de retrabalho superior a 10%,
              indicando possíveis problemas de qualidade ou comunicação:
            </p>
            <div className="space-y-2">
              {qualityIssues.map((stage) => (
                <div
                  key={stage.stageId}
                  className="flex justify-between items-center p-3 bg-red-50 rounded-lg"
                >
                  <div>
                    <div className="font-medium">{stage.stageName}</div>
                    <div className="text-xs text-muted-foreground">
                      {stage.templateName} • {stage.completed} completo,{" "}
                      {stage.reverted} revertido
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-red-500">
                      {(stage.reworkRate * 100).toFixed(0)}%
                    </div>
                    <div className="text-xs text-muted-foreground">retrabalho</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
