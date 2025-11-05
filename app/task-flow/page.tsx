import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, CheckCircle2, XCircle, Users, FileText, Palette, Code, Search, Sparkles } from "lucide-react"

export default function TaskFlowPresentation() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/70 text-primary-foreground py-12">
        <div className="max-w-6xl mx-auto px-4">
          <h1 className="text-5xl font-bold mb-4">Fluxo de Tarefas</h1>
          <p className="text-xl opacity-90">A Jornada da Landing Page: Do Briefing ao Lançamento</p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-block px-6 py-2 bg-white text-primary font-semibold rounded-lg hover:bg-white/90 transition-all shadow-md"
            >
              Voltar ao Início
            </Link>
          </div>
        </div>
      </div>

      {/* Introduction */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <Card className="mb-8 border-primary/20">
          <CardHeader>
            <CardTitle className="text-3xl">Bem-vindo ao Futuro da Gestão de Projetos</CardTitle>
            <CardDescription className="text-base">
              Vamos simular a criação de uma Landing Page, algo que hoje gera dezenas de e-mails,
              mensagens no WhatsApp e links perdidos no Trello. Veja como isso funciona no novo sistema.
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Step 1: Conception */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2">Etapa 1</Badge>
            <h2 className="text-3xl font-bold text-foreground">Concepção - O Pedido</h2>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-6 w-6 text-primary" />
                <CardTitle>Manager ou Supervisor</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p className="text-base"><strong>O que ele faz:</strong> Clica em &ldquo;Nova Demanda&rdquo; e seleciona o template <Badge variant="outline">Landing Page</Badge></p>
                <p className="text-base"><strong>O que o sistema faz:</strong> Mostra instantaneamente o caminho que a tarefa vai percorrer:</p>
                <div className="flex items-center gap-2 flex-wrap my-4">
                  <Badge variant="secondary">Briefing & Copy</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">Design</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">Dev</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">QC</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">SEO</Badge>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-semibold mb-2">Informações preenchidas:</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>Título: &ldquo;LP Lançamento Produto X&rdquo;</li>
                    <li>Cliente: &ldquo;Cliente Y&rdquo;</li>
                    <li>Data de Entrega: &ldquo;30/11&rdquo;</li>
                    <li>Artefato: &ldquo;Briefing da Reunião (Google Doc)&rdquo;</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 2: Briefing & Copy */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2">Etapa 2</Badge>
            <h2 className="text-3xl font-bold text-foreground">Briefing & Copy</h2>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                <CardTitle>Copywriter em Ação</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950 border-2 border-green-500 p-4 rounded-lg">
                <p className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-300">
                  <Sparkles className="h-5 w-5" />
                  O Pulo do Gato
                </p>
                <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                  A tarefa aparece APENAS no dashboard da equipe de Copywriting.
                  O Designer e o Dev não veem este card. O dashboard deles continua limpo.
                </p>
              </div>

              <div className="space-y-3">
                <p><strong>Quem:</strong> Copywriter</p>
                <p><strong>Ação:</strong></p>
                <ol className="list-decimal list-inside space-y-2 ml-4">
                  <li>Abre a tarefa e vê o briefing anexado (não precisa perguntar &ldquo;cadê o briefing?&rdquo;)</li>
                  <li>Clica em <Badge variant="outline">Iniciar Tarefa</Badge> (O Manager vê no Dashboard Ao Vivo que o trabalho começou)</li>
                  <li>Escreve o texto em um Google Doc</li>
                  <li>Anexa o link &ldquo;Textos Finais (Google Doc)&rdquo;</li>
                  <li>Clica em <Badge variant="success">Avançar Etapa</Badge></li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 3: Design */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2">Etapa 3</Badge>
            <h2 className="text-3xl font-bold text-foreground">Design - O Handoff Automático</h2>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-6 w-6 text-primary" />
                <CardTitle>Designer Recebe Contexto Completo</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-500 p-4 rounded-lg">
                <p className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-300">
                  <CheckCircle2 className="h-5 w-5" />
                  Transição Automática
                </p>
                <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                  O sistema é a &ldquo;Máquina de Estados&rdquo;. Quando o Copywriter avança, a tarefa
                  desaparece do seu dashboard e aparece magicamente no dashboard dos Designers.
                </p>
              </div>

              <div className="space-y-3">
                <p><strong>Quem:</strong> Designer</p>
                <p><strong>Contexto disponível:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Briefing original</li>
                  <li>Textos Finais do Copywriter</li>
                  <li>100% do contexto necessário</li>
                </ul>
                <p><strong>Ação:</strong> Clica em <Badge variant="outline">Iniciar Tarefa</Badge> e começa a desenhar no Figma</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 4: Review Loop */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="destructive" className="text-lg px-4 py-2">Loop de Revisão</Badge>
            <h2 className="text-3xl font-bold text-foreground">A Realidade do Dia a Dia</h2>
          </div>

          <Card className="border-orange-500/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <XCircle className="h-6 w-6 text-orange-500" />
                <CardTitle>Rejeição e Retrabalho</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p><strong>Cenário:</strong> O Designer finaliza a v1, anexa o Figma e avança. Mas o Supervisor não gosta do resultado.</p>

                <div className="bg-orange-50 dark:bg-orange-950 border-2 border-orange-500 p-4 rounded-lg">
                  <p className="font-semibold text-orange-700 dark:text-orange-300">Ação do Supervisor:</p>
                  <ol className="list-decimal list-inside space-y-2 mt-2 text-sm text-orange-600 dark:text-orange-400">
                    <li>Clica em <Badge variant="destructive" className="inline-flex mx-1">Reverter Etapa</Badge></li>
                    <li>Sistema OBRIGA a escrever um comentário: &ldquo;O botão Comprar está muito pequeno. Ajustar a cor.&rdquo;</li>
                    <li>Tarefa volta para a fila do Designer, sinalizada como &ldquo;Em Revisão&rdquo;</li>
                  </ol>
                </div>

                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-semibold">Ponto Chave para a Gestão:</p>
                  <p className="text-sm mt-2">
                    Todo esse vai e vem, que hoje se perde, fica 100% registrado no histórico da tarefa.
                    E o <strong>Relatório de Gargalos</strong> registra automaticamente que a etapa de Design teve retrabalho.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 5: Development */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2">Etapa 4</Badge>
            <h2 className="text-3xl font-bold text-foreground">Desenvolvimento</h2>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Code className="h-6 w-6 text-primary" />
                <CardTitle>Dev com Fonte Única da Verdade</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p><strong>Quem:</strong> Desenvolvedor</p>
                <p><strong>Contexto disponível:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>Briefing original</li>
                  <li>Textos Finais</li>
                  <li><strong className="text-primary">v2 do Figma Aprovado</strong> (não corre risco de usar versão antiga)</li>
                </ul>

                <div className="bg-green-50 dark:bg-green-950 border-2 border-green-500 p-4 rounded-lg mt-4">
                  <p className="font-semibold text-green-700 dark:text-green-300">Ponto Chave:</p>
                  <p className="text-sm mt-2 text-green-600 dark:text-green-400">
                    O Dev não precisa perguntar nada. Tem a versão correta e aprovada do design.
                    Fonte única da verdade!
                  </p>
                </div>

                <p className="mt-4"><strong>Finalização:</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-4">
                  <li>Clica em <Badge variant="outline">Iniciar Tarefa</Badge></li>
                  <li>Constrói a página</li>
                  <li>Anexa o artefato: &ldquo;Link de Staging (Vercel)&rdquo;</li>
                  <li>Clica em <Badge variant="success">Avançar Etapa</Badge></li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 6: Parallel Work */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2">Etapas 5 & 6</Badge>
            <h2 className="text-3xl font-bold text-foreground">QC e SEO - Trabalho Paralelo</h2>
          </div>

          <Card className="border-purple-500/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Search className="h-6 w-6 text-purple-500" />
                <CardTitle>A Mágica do Sistema</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-purple-50 dark:bg-purple-950 border-2 border-purple-500 p-4 rounded-lg">
                <p className="flex items-center gap-2 font-semibold text-purple-700 dark:text-purple-300">
                  <Sparkles className="h-5 w-5" />
                  Trabalho Simultâneo
                </p>
                <p className="mt-2 text-sm text-purple-600 dark:text-purple-400">
                  O Dev era dependência para duas etapas. A tarefa aparece SIMULTANEAMENTE
                  na fila de Quality Control E na fila de SEO.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-semibold mb-2">Equipe QC:</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    <li>Testa todos os links</li>
                    <li>Verifica responsividade</li>
                    <li>Valida funcionalidades</li>
                    <li>Clica em <Badge variant="success" className="inline-flex mx-1">Concluir Etapa</Badge></li>
                  </ul>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-semibold mb-2">Equipe SEO:</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    <li>Otimiza meta tags</li>
                    <li>Ajusta URLs</li>
                    <li>Configura Analytics</li>
                    <li>Clica em <Badge variant="success" className="inline-flex mx-1">Concluir Etapa</Badge></li>
                  </ul>
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-950 border-2 border-green-500 p-4 rounded-lg mt-4">
                <p className="font-semibold text-green-700 dark:text-green-300">Ponto Chave:</p>
                <p className="text-sm mt-2 text-green-600 dark:text-green-400">
                  Não precisamos esperar o QC terminar para o SEO começar. As duas equipes trabalham em paralelo,
                  economizando dias de projeto!
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 7: Conclusion */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="success" className="text-lg px-4 py-2">Conclusão</Badge>
            <h2 className="text-3xl font-bold text-foreground">Tarefa Concluída</h2>
          </div>

          <Card className="border-green-500/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
                <CardTitle>Todas as Etapas Completas</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p><strong>O que acontece:</strong> O sistema detecta que todas as etapas foram concluídas e move a demanda para status <Badge variant="success">Concluído</Badge></p>

              <div className="bg-muted p-6 rounded-lg space-y-4">
                <p className="font-semibold text-lg">Benefícios para a Gestão:</p>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-background p-4 rounded-lg border-2 border-border">
                    <p className="font-semibold text-primary mb-2">1. Organização</p>
                    <p className="text-sm">A tarefa é fechada e sai dos dashboards automaticamente</p>
                  </div>

                  <div className="bg-background p-4 rounded-lg border-2 border-border">
                    <p className="font-semibold text-primary mb-2">2. Timesheet Automático</p>
                    <p className="text-sm">O Relatório de Produtividade foi 100% preenchido:</p>
                    <ul className="text-xs mt-2 space-y-1">
                      <li>Copy: 2h</li>
                      <li>Design: 6h</li>
                      <li>Dev: 8h</li>
                      <li>QC: 1.5h</li>
                      <li>SEO: 2h</li>
                    </ul>
                  </div>

                  <div className="bg-background p-4 rounded-lg border-2 border-border">
                    <p className="font-semibold text-primary mb-2">3. Análise de Gargalos</p>
                    <p className="text-sm">O Relatório mostra exatamente quantos dias a tarefa ficou parada em cada etapa</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30">
          <CardHeader>
            <CardTitle className="text-3xl">Resumo da Apresentação</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">
              Em 5 minutos, a tarefa navegou por 5 equipes diferentes, teve uma revisão (rejeição)
              e duas equipes trabalharam em paralelo, sem que <strong>ninguém</strong> precisasse:
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-base ml-4">
              <li>Enviar um e-mail</li>
              <li>Mandar uma mensagem no WhatsApp</li>
              <li>&ldquo;Cutucar&rdquo; o colega perguntando &ldquo;E aí, já terminou?&rdquo;</li>
            </ul>
            <div className="mt-6 p-4 bg-primary text-primary-foreground rounded-lg text-center">
              <p className="text-xl font-bold">Tudo acontece automaticamente. Tudo fica registrado. Zero fricção.</p>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-md hover:shadow-lg transition-all"
          >
            Voltar ao Início
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-muted py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-muted-foreground">
          <p>Work OS - Sistema de Gestão de Operações</p>
        </div>
      </div>
    </div>
  )
}
