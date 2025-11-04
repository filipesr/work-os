import { Suspense } from "react";
import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import {
  getHoursByUser,
  getHoursByProject,
  getHoursByClient,
  getHoursByStage,
} from "@/lib/actions/reporting";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Clock, Users, Briefcase, Building2, Workflow } from "lucide-react";

export default async function ProductivityReportPage({
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
  const [hoursByUser, hoursByProject, hoursByClient, hoursByStage] =
    await Promise.all([
      getHoursByUser(filters),
      getHoursByProject(filters),
      getHoursByClient(filters),
      getHoursByStage(filters),
    ]);

  // Calculate totals
  const totalHours = hoursByUser.reduce((sum, u) => sum + u.totalHours, 0);

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
            <h1 className="text-3xl font-bold">Relatório de Produtividade</h1>
          </div>
          <p className="text-muted-foreground">
            Análise de tempo gasto por usuário, projeto, cliente e etapa do fluxo
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
              <label htmlFor="startDate" className="text-sm font-medium block mb-2">
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
                href="/reports/productivity"
                className="px-4 py-2 border rounded-md hover:bg-muted"
              >
                Limpar
              </Link>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Summary Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total de Horas</p>
              <p className="text-3xl font-bold">{totalHours.toFixed(1)}h</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hours by User */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <CardTitle>Horas por Usuário</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {hoursByUser.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum registro de tempo encontrado
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 pb-2 border-b font-semibold text-sm">
                  <div>Usuário</div>
                  <div className="text-right">Horas</div>
                </div>
                {hoursByUser.map((user) => (
                  <div key={user.userId} className="grid grid-cols-2 gap-2 text-sm">
                    <div className="truncate">
                      {user.userName || user.userEmail || "Sem nome"}
                    </div>
                    <div className="text-right font-medium">
                      {user.totalHours.toFixed(1)}h
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hours by Project */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              <CardTitle>Horas por Projeto</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {hoursByProject.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum registro de tempo encontrado
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 pb-2 border-b font-semibold text-sm">
                  <div>Projeto</div>
                  <div className="text-right">Horas</div>
                </div>
                {hoursByProject.map((project) => (
                  <div key={project.projectId} className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="font-medium truncate">{project.projectName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {project.clientName}
                      </div>
                    </div>
                    <div className="text-right font-medium">
                      {project.totalHours.toFixed(1)}h
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hours by Client */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              <CardTitle>Horas por Cliente</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {hoursByClient.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum registro de tempo encontrado
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 pb-2 border-b font-semibold text-sm">
                  <div>Cliente</div>
                  <div className="text-right">Horas</div>
                </div>
                {hoursByClient.map((client) => (
                  <div key={client.clientId} className="grid grid-cols-2 gap-2 text-sm">
                    <div className="truncate">{client.clientName}</div>
                    <div className="text-right font-medium">
                      {client.totalHours.toFixed(1)}h
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hours by Stage */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Workflow className="h-5 w-5" />
              <CardTitle>Horas por Etapa</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {hoursByStage.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum registro de tempo encontrado
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 pb-2 border-b font-semibold text-sm">
                  <div>Etapa</div>
                  <div className="text-right">Horas</div>
                </div>
                {hoursByStage.map((stage) => (
                  <div key={stage.stageId} className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="font-medium truncate">{stage.stageName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {stage.templateName}
                      </div>
                    </div>
                    <div className="text-right font-medium">
                      {stage.totalHours.toFixed(1)}h
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
