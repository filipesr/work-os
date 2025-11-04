import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingDown, Clock, ArrowRight, Activity } from "lucide-react";

export default async function ReportsIndexPage() {
  // Check authorization
  try {
    await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);
  } catch (error) {
    redirect("/auth/signin");
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Relatórios e Análises</h1>
        <p className="text-muted-foreground">
          Inteligência de negócios para melhorar a produtividade e identificar
          gargalos no fluxo de trabalho
        </p>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Productivity Report */}
        <Link href="/reports/productivity">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <Clock className="h-6 w-6 text-blue-500" />
                </div>
                <div className="flex-1">
                  <CardTitle>Relatório de Produtividade</CardTitle>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardDescription>
                Visualize o tempo gasto por usuário, projeto, cliente e etapa do
                workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  <span>Horas registradas por usuário</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  <span>Tempo investido por projeto e cliente</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500">•</span>
                  <span>Distribuição de esforço por etapa do fluxo</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </Link>

        {/* Performance Report */}
        <Link href="/reports/performance">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-orange-500/10 rounded-lg">
                  <TrendingDown className="h-6 w-6 text-orange-500" />
                </div>
                <div className="flex-1">
                  <CardTitle>Relatório de Desempenho</CardTitle>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardDescription>
                Identifique gargalos no workflow e analise a taxa de retrabalho
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>Tempo médio em cada etapa (bottlenecks)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>Taxa de retrabalho e reversões</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>Lead time e throughput do sistema</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </Link>

        {/* Live Activity Report */}
        <Link href="/reports/live-activity">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <Activity className="h-6 w-6 text-green-500" />
                </div>
                <div className="flex-1">
                  <CardTitle>Atividade em Tempo Real</CardTitle>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </div>
              <CardDescription>
                Visualize quem está trabalhando em quais tarefas neste momento
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-green-500">•</span>
                  <span>Colaboradores ativos no momento</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">•</span>
                  <span>Tempo de trabalho em cada tarefa</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500">•</span>
                  <span>Atualização automática a cada 10 segundos</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <CardTitle className="text-lg">Como usar os relatórios</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">📊 Relatório de Produtividade</p>
            <p className="text-muted-foreground">
              Use este relatório para entender quanto tempo sua equipe está gastando
              em cada projeto e etapa. Ideal para faturamento por hora e alocação de
              recursos.
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">⚡ Relatório de Desempenho</p>
            <p className="text-muted-foreground">
              Este relatório identifica onde o trabalho está "travando". Etapas com
              alto tempo médio são gargalos. Alta taxa de retrabalho indica problemas
              de qualidade ou comunicação.
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">🟢 Atividade em Tempo Real</p>
            <p className="text-muted-foreground">
              Acompanhe em tempo real quem está trabalhando em quê. Perfeito para
              gestores que precisam ter visibilidade imediata da alocação da equipe.
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">💡 Dica</p>
            <p className="text-muted-foreground">
              Use os filtros de data para comparar períodos diferentes e identificar
              tendências ao longo do tempo.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
