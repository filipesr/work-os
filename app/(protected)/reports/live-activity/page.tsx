"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveWorkLogs } from "@/lib/actions/activity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Activity, Clock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getProxiedImageUrl } from "@/lib/utils/image-proxy";

// Define a type for the data
type ActiveLogData = Awaited<ReturnType<typeof getActiveWorkLogs>>;

export default function LiveActivityPage() {
  const [activeLogs, setActiveLogs] = useState<ActiveLogData>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchData = async () => {
    try {
      const data = await getActiveWorkLogs();
      setActiveLogs(data);
      setLastUpdated(new Date());
      setIsLoading(false);
    } catch (error) {
      console.error("Error fetching active work logs:", error);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Fetch immediately on mount
    fetchData();

    // Set up the 10-second polling
    const intervalId = setInterval(fetchData, 10000);

    // Clean up the interval on unmount
    return () => clearInterval(intervalId);
  }, []);

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
            <h1 className="text-3xl font-bold">Atividade em Tempo Real</h1>
          </div>
          <p className="text-muted-foreground">
            Visualize quem está trabalhando em quê neste momento (atualiza a cada
            10 segundos)
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>
            Atualizado{" "}
            {formatDistanceToNow(lastUpdated, { addSuffix: true, locale: ptBR })}
          </span>
        </div>
      </div>

      {/* Summary Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-full">
              <Activity className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Colaboradores Ativos
              </p>
              <p className="text-3xl font-bold">{activeLogs.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Work Logs */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin mb-2" />
              <p>Carregando atividades...</p>
            </div>
          </CardContent>
        </Card>
      ) : activeLogs.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              <Activity className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-lg font-medium">
                Nenhum colaborador trabalhando ativamente no momento
              </p>
              <p className="text-sm mt-2">
                Quando alguém iniciar uma tarefa, ela aparecerá aqui em tempo real
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {activeLogs.map((log) => {
            const duration = new Date().getTime() - new Date(log.startedAt).getTime();
            const durationMinutes = Math.floor(duration / 1000 / 60);
            const durationHours = Math.floor(durationMinutes / 60);
            const remainingMinutes = durationMinutes % 60;

            return (
              <Link key={log.id} href={`/tasks/${log.task.id}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-center gap-4">
                      {/* User Avatar */}
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={getProxiedImageUrl(log.user.image) || undefined} />
                        <AvatarFallback>
                          {log.user.name?.charAt(0).toUpperCase() || "?"}
                        </AvatarFallback>
                      </Avatar>

                      {/* User and Task Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold truncate">
                            {log.user.name || log.user.email}
                          </p>
                          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          Trabalhando em:{" "}
                          <span className="font-medium text-foreground">
                            {log.task.title}
                          </span>
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>
                            📁 {log.task.project.name} (
                            {log.task.project.client.name})
                          </span>
                          <span>📌 {log.stage.name}</span>
                        </div>
                      </div>

                      {/* Duration */}
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm font-medium">
                          <Clock className="h-4 w-4" />
                          {durationHours > 0 ? (
                            <span>
                              {durationHours}h {remainingMinutes}min
                            </span>
                          ) : (
                            <span>{durationMinutes} min</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Iniciado{" "}
                          {formatDistanceToNow(new Date(log.startedAt), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <CardTitle className="text-lg">Como funciona</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Este dashboard mostra em tempo real quem está trabalhando em quais
            tarefas neste momento.
          </p>
          <p>
            Quando um colaborador clica em "Iniciar Tarefa" no detalhe de uma
            tarefa, ele aparece nesta lista automaticamente.
          </p>
          <p>
            O tempo exibido mostra há quanto tempo o colaborador está trabalhando
            na tarefa atual.
          </p>
          <p className="text-muted-foreground">
            💡 Esta página atualiza automaticamente a cada 10 segundos.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
