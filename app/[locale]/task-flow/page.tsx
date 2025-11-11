import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, CheckCircle2, XCircle, Users, FileText, Palette, Code, Search, Sparkles, GitBranch, GitMerge, Lock, Zap, Eye, Bot } from "lucide-react"
import { getTranslations } from "next-intl/server"

export default async function TaskFlowPresentation() {
  const t = await getTranslations("taskFlow");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/70 text-primary-foreground py-12">
        <div className="max-w-6xl mx-auto px-4">
          <h1 className="text-5xl font-bold mb-4">{t("header.title")}</h1>
          <p className="text-xl opacity-90">{t("header.subtitle")}</p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-block px-6 py-2 bg-white text-primary font-semibold rounded-lg hover:bg-white/90 transition-all shadow-md"
            >
              {t("header.backButton")}
            </Link>
          </div>
        </div>
      </div>

      {/* Introduction */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <Card className="mb-8 border-primary/20">
          <CardHeader>
            <CardTitle className="text-3xl">{t("introduction.title")}</CardTitle>
            <CardDescription className="text-base">
              {t("introduction.description")}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Concepts Section */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold mb-6 text-center">{t("concepts.title")}</h2>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <Card className="border-blue-500/50">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch className="h-6 w-6 text-blue-500" />
                  <CardTitle className="text-lg">{t("concepts.taskActiveStage.title")}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{t("concepts.taskActiveStage.description")}</p>
                <div className="bg-muted p-3 rounded text-xs space-y-2">
                  <p className="text-red-600 dark:text-red-400">❌ {t("concepts.taskActiveStage.traditional")}</p>
                  <p className="text-green-600 dark:text-green-400">✅ {t("concepts.taskActiveStage.new")}</p>
                </div>
                <div className="text-xs space-y-1">
                  <p className="font-semibold">{t("concepts.taskActiveStage.statuses.title")}</p>
                  <p className="text-green-600">🟢 {t("concepts.taskActiveStage.statuses.active")}</p>
                  <p className="text-orange-600">⏸️ {t("concepts.taskActiveStage.statuses.blocked")}</p>
                  <p className="text-gray-600">✅ {t("concepts.taskActiveStage.statuses.completed")}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-purple-500/50">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-6 w-6 text-purple-500" />
                  <CardTitle className="text-lg">{t("concepts.dashboard.title")}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{t("concepts.dashboard.description")}</p>
                <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded text-xs">
                  <p className="font-semibold mb-2">💡 {t("concepts.dashboard.example")}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-500/50">
              <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-6 w-6 text-green-500" />
                  <CardTitle className="text-lg">{t("concepts.assignment.title")}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{t("concepts.assignment.description")}</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Step 1: Conception */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2">{t("step1.badge")}</Badge>
            <h2 className="text-3xl font-bold text-foreground">{t("step1.title")}</h2>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-6 w-6 text-primary" />
                <CardTitle>{t("step1.actor")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p className="text-base"><strong>{t("step1.actionLabel")}</strong> {t("step1.actionText")} <Badge variant="outline">Landing Page</Badge></p>
                <p className="text-base"><strong>{t("step1.systemLabel")}</strong> {t("step1.systemText")}</p>
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
                  <p className="font-semibold mb-2">{t("step1.infoTitle")}</p>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li>{t("step1.infoItems.title")}</li>
                    <li>{t("step1.infoItems.client")}</li>
                    <li>{t("step1.infoItems.deadline")}</li>
                    <li>{t("step1.infoItems.artifact")}</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 2: Briefing & Copy */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2">{t("step2.badge")}</Badge>
            <h2 className="text-3xl font-bold text-foreground">{t("step2.title")}</h2>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                <CardTitle>{t("step2.actor")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-green-50 dark:bg-green-950 border-2 border-green-500 p-4 rounded-lg">
                <p className="flex items-center gap-2 font-semibold text-green-700 dark:text-green-300">
                  <Sparkles className="h-5 w-5" />
                  {t("step2.highlightTitle")}
                </p>
                <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                  {t("step2.highlightText")}
                </p>
              </div>

              <div className="space-y-3">
                <p><strong>{t("step2.who")}</strong> {t("step2.whoText")}</p>
                <p><strong>{t("step2.actionLabel")}</strong></p>
                <ol className="list-decimal list-inside space-y-2 ml-4">
                  <li>{t("step2.actions.1")}</li>
                  <li>{t("step2.actions.2")}</li>
                  <li>{t("step2.actions.3")}</li>
                  <li>{t("step2.actions.4")}</li>
                  <li>{t("step2.actions.5")}</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 3: Design */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2">{t("step3.badge")}</Badge>
            <h2 className="text-3xl font-bold text-foreground">{t("step3.title")}</h2>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-6 w-6 text-primary" />
                <CardTitle>{t("step3.actor")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-500 p-4 rounded-lg">
                <p className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-300">
                  <CheckCircle2 className="h-5 w-5" />
                  {t("step3.highlightTitle")}
                </p>
                <p className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                  {t("step3.highlightText")}
                </p>
              </div>

              <div className="space-y-3">
                <p><strong>{t("step3.who")}</strong> {t("step3.whoText")}</p>
                <p><strong>{t("step3.contextLabel")}</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>{t("step3.context.1")}</li>
                  <li>{t("step3.context.2")}</li>
                  <li>{t("step3.context.3")}</li>
                </ul>
                <p><strong>{t("step3.actionLabel")}</strong> {t("step3.actionText")}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 4: Review Loop */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="destructive" className="text-lg px-4 py-2">{t("step4.badge")}</Badge>
            <h2 className="text-3xl font-bold text-foreground">{t("step4.title")}</h2>
          </div>

          <Card className="border-orange-500/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <XCircle className="h-6 w-6 text-orange-500" />
                <CardTitle>{t("step4.actor")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p><strong>{t("step4.scenarioLabel")}</strong> {t("step4.scenarioText")}</p>

                <div className="bg-orange-50 dark:bg-orange-950 border-2 border-orange-500 p-4 rounded-lg">
                  <p className="font-semibold text-orange-700 dark:text-orange-300">{t("step4.supervisorActionTitle")}</p>
                  <ol className="list-decimal list-inside space-y-2 mt-2 text-sm text-orange-600 dark:text-orange-400">
                    <li>{t("step4.supervisorActions.1")}</li>
                    <li>{t("step4.supervisorActions.2")}</li>
                    <li>{t("step4.supervisorActions.3")}</li>
                  </ol>
                </div>

                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-semibold">{t("step4.keyPointTitle")}</p>
                  <p className="text-sm mt-2">
                    {t("step4.keyPointText")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 5: Development */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2">{t("step5.badge")}</Badge>
            <h2 className="text-3xl font-bold text-foreground">{t("step5.title")}</h2>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Code className="h-6 w-6 text-primary" />
                <CardTitle>{t("step5.actor")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p><strong>{t("step5.who")}</strong> {t("step5.whoText")}</p>
                <p><strong>{t("step5.contextLabel")}</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>{t("step5.context.1")}</li>
                  <li>{t("step5.context.2")}</li>
                  <li>{t("step5.context.3")}</li>
                </ul>

                <div className="bg-green-50 dark:bg-green-950 border-2 border-green-500 p-4 rounded-lg mt-4">
                  <p className="font-semibold text-green-700 dark:text-green-300">{t("step5.keyPointTitle")}</p>
                  <p className="text-sm mt-2 text-green-600 dark:text-green-400">
                    {t("step5.keyPointText")}
                  </p>
                </div>

                <p className="mt-4"><strong>{t("step5.finalizationLabel")}</strong></p>
                <ol className="list-decimal list-inside space-y-1 ml-4">
                  <li>{t("step5.finalization.1")}</li>
                  <li>{t("step5.finalization.2")}</li>
                  <li>{t("step5.finalization.3")}</li>
                  <li>{t("step5.finalization.4")}</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 6: Parallel Work - FORK */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2">{t("step6.badge")}</Badge>
            <h2 className="text-3xl font-bold text-foreground">{t("step6.title")}</h2>
          </div>

          <Card className="border-purple-500/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <GitBranch className="h-6 w-6 text-purple-500" />
                <CardTitle>{t("step6.actor")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-purple-50 dark:bg-purple-950 border-2 border-purple-500 p-4 rounded-lg">
                <p className="flex items-center gap-2 font-semibold text-purple-700 dark:text-purple-300">
                  <GitBranch className="h-5 w-5" />
                  {t("step6.highlightTitle")}
                </p>
                <p className="mt-2 text-sm text-purple-600 dark:text-purple-400">
                  {t("step6.highlightText")}
                </p>
              </div>

              {/* What happens during Fork */}
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-semibold mb-3">{t("step6.whatHappens")}</p>
                <ol className="list-decimal list-inside space-y-2 text-sm ml-2">
                  <li>{t("step6.forkSteps.1")}</li>
                  <li>{t("step6.forkSteps.2")}</li>
                  <li>{t("step6.forkSteps.3")}</li>
                  <li>{t("step6.forkSteps.4")}</li>
                </ol>
              </div>

              {/* Dashboard Visibility */}
              <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-500 p-4 rounded-lg">
                <p className="font-semibold text-blue-700 dark:text-blue-300 mb-2">
                  {t("step6.dashboardTitle")}
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-400 mb-3">
                  {t("step6.dashboardText")}
                </p>
                <ul className="list-disc list-inside text-sm space-y-1 ml-2 text-blue-600 dark:text-blue-400">
                  <li>{t("step6.dashboardItems.1")}</li>
                  <li>{t("step6.dashboardItems.2")}</li>
                  <li>{t("step6.dashboardItems.3")}</li>
                </ul>
              </div>

              {/* Parallel Work */}
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div className="bg-muted p-4 rounded-lg border-2 border-green-300">
                  <p className="font-semibold mb-2 text-green-700 dark:text-green-400">{t("step6.qcTitle")}</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    <li>{t("step6.qcTasks.1")}</li>
                    <li>{t("step6.qcTasks.2")}</li>
                    <li>{t("step6.qcTasks.3")}</li>
                    <li>{t("step6.qcTasks.4")}</li>
                  </ul>
                </div>
                <div className="bg-muted p-4 rounded-lg border-2 border-green-300">
                  <p className="font-semibold mb-2 text-green-700 dark:text-green-400">{t("step6.seoTitle")}</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    <li>{t("step6.seoTasks.1")}</li>
                    <li>{t("step6.seoTasks.2")}</li>
                    <li>{t("step6.seoTasks.3")}</li>
                    <li>{t("step6.seoTasks.4")}</li>
                  </ul>
                </div>
              </div>

              {/* Time Savings */}
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950 dark:to-orange-950 border-2 border-yellow-500 p-4 rounded-lg">
                <p className="flex items-center gap-2 font-semibold text-yellow-700 dark:text-yellow-300">
                  <Zap className="h-5 w-5" />
                  {t("step6.timeSavingsTitle")}
                </p>
                <p className="text-sm mt-2 text-yellow-600 dark:text-yellow-400">
                  {t("step6.timeSavingsText")}
                </p>
              </div>

              <div className="bg-green-50 dark:bg-green-950 border-2 border-green-500 p-4 rounded-lg mt-4">
                <p className="font-semibold text-green-700 dark:text-green-300">{t("step6.keyPointTitle")}</p>
                <p className="text-sm mt-2 text-green-600 dark:text-green-400">
                  {t("step6.keyPointText")}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Step 7: Conclusion */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="success" className="text-lg px-4 py-2">{t("step7.badge")}</Badge>
            <h2 className="text-3xl font-bold text-foreground">{t("step7.title")}</h2>
          </div>

          <Card className="border-green-500/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
                <CardTitle>{t("step7.actor")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p><strong>{t("step7.whatHappens")}</strong> {t("step7.whatHappensText")}</p>

              <div className="bg-muted p-6 rounded-lg space-y-4">
                <p className="font-semibold text-lg">{t("step7.benefitsTitle")}</p>

                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-background p-4 rounded-lg border-2 border-border">
                    <p className="font-semibold text-primary mb-2">{t("step7.benefits.organization.title")}</p>
                    <p className="text-sm">{t("step7.benefits.organization.text")}</p>
                  </div>

                  <div className="bg-background p-4 rounded-lg border-2 border-border">
                    <p className="font-semibold text-primary mb-2">{t("step7.benefits.timesheet.title")}</p>
                    <p className="text-sm">{t("step7.benefits.timesheet.text")}</p>
                    <ul className="text-xs mt-2 space-y-1">
                      <li>{t("step7.benefits.timesheet.items.copy")}</li>
                      <li>{t("step7.benefits.timesheet.items.design")}</li>
                      <li>{t("step7.benefits.timesheet.items.dev")}</li>
                      <li>{t("step7.benefits.timesheet.items.qc")}</li>
                      <li>{t("step7.benefits.timesheet.items.seo")}</li>
                    </ul>
                  </div>

                  <div className="bg-background p-4 rounded-lg border-2 border-border">
                    <p className="font-semibold text-primary mb-2">{t("step7.benefits.analysis.title")}</p>
                    <p className="text-sm">{t("step7.benefits.analysis.text")}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* JOIN Example */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2 bg-orange-500">{t("joinExample.badge")}</Badge>
            <h2 className="text-3xl font-bold text-foreground">{t("joinExample.title")}</h2>
          </div>

          <Card className="border-orange-500/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <GitMerge className="h-6 w-6 text-orange-500" />
                <CardTitle>{t("joinExample.subtitle")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Scenario */}
              <div className="bg-orange-50 dark:bg-orange-950 border-2 border-orange-500 p-4 rounded-lg">
                <p className="font-semibold text-orange-700 dark:text-orange-300 mb-2">
                  {t("joinExample.scenario")}
                </p>
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  {t("joinExample.scenarioText")}
                </p>
                <div className="mt-3 bg-white dark:bg-gray-900 p-3 rounded">
                  <p className="font-semibold text-xs mb-1">{t("joinExample.workflow.title")}</p>
                  <p className="text-xs font-mono">{t("joinExample.workflow.stages")}</p>
                </div>
              </div>

              <p className="font-semibold">{t("joinExample.whatHappens")}</p>

              {/* Step 1: First completion */}
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-semibold mb-3 text-blue-700 dark:text-blue-400">
                  {t("joinExample.step1Title")}
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm ml-2">
                  <li>{t("joinExample.step1Items.1")}</li>
                  <li>{t("joinExample.step1Items.2")}</li>
                  <li>{t("joinExample.step1Items.3")}</li>
                  <li>{t("joinExample.step1Items.4")}</li>
                  <li className="font-semibold text-orange-600">{t("joinExample.step1Items.5")}</li>
                </ol>
              </div>

              {/* Step 2: JOIN happens */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 border-2 border-green-500 p-4 rounded-lg">
                <p className="font-semibold mb-3 text-green-700 dark:text-green-400">
                  {t("joinExample.step2Title")}
                </p>
                <ol className="list-decimal list-inside space-y-2 text-sm ml-2">
                  <li>{t("joinExample.step2Items.1")}</li>
                  <li>{t("joinExample.step2Items.2")}</li>
                  <li>{t("joinExample.step2Items.3")}</li>
                  <li>{t("joinExample.step2Items.4")}</li>
                  <li className="font-bold text-green-700 dark:text-green-300">{t("joinExample.step2Items.5")}</li>
                  <li>{t("joinExample.step2Items.6")}</li>
                </ol>
              </div>

              {/* Dashboard Visualization */}
              <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-500 p-4 rounded-lg">
                <p className="font-semibold text-blue-700 dark:text-blue-300 mb-3">
                  {t("joinExample.visualTitle")}
                </p>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                      {t("joinExample.visualBefore")}
                    </p>
                    <div className="bg-orange-100 dark:bg-orange-900 p-3 rounded border-l-4 border-orange-500">
                      <p className="text-sm font-mono">
                        {t("joinExample.visualBeforeText")}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                      {t("joinExample.visualAfter")}
                    </p>
                    <div className="bg-green-100 dark:bg-green-900 p-3 rounded border-l-4 border-green-500">
                      <p className="text-sm font-mono">
                        {t("joinExample.visualAfterText")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Point */}
              <div className="bg-purple-50 dark:bg-purple-950 border-2 border-purple-500 p-4 rounded-lg">
                <p className="flex items-center gap-2 font-semibold text-purple-700 dark:text-purple-300">
                  <Lock className="h-5 w-5" />
                  {t("joinExample.keyPointTitle")}
                </p>
                <p className="text-sm mt-2 text-purple-600 dark:text-purple-400">
                  {t("joinExample.keyPointText")}
                </p>
              </div>

              {/* Comparison */}
              <div className="bg-muted p-4 rounded-lg">
                <p className="font-semibold mb-3">{t("joinExample.comparisonTitle")}</p>
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-purple-500" />
                    <span className="font-semibold">FORK:</span> {t("joinExample.fork")}
                  </p>
                  <p className="flex items-center gap-2">
                    <GitMerge className="h-4 w-4 text-orange-500" />
                    <span className="font-semibold">JOIN:</span> {t("joinExample.join")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30">
          <CardHeader>
            <CardTitle className="text-3xl">{t("summary.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">
              {t("summary.intro")}
            </p>
            <ul className="list-disc list-inside mt-4 space-y-2 text-base ml-4">
              <li>{t("summary.noNeeds.1")}</li>
              <li>{t("summary.noNeeds.2")}</li>
              <li>{t("summary.noNeeds.3")}</li>
            </ul>
            <div className="mt-6 p-4 bg-primary text-primary-foreground rounded-lg text-center">
              <p className="text-xl font-bold">{t("summary.conclusion")}</p>
            </div>

            {/* Benefits */}
            <div className="mt-8">
              <p className="font-semibold text-xl mb-4">{t("summary.benefits.title")}</p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 bg-background p-4 rounded-lg border">
                  <Zap className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-1" />
                  <p className="text-sm">{t("summary.benefits.parallelization")}</p>
                </div>
                <div className="flex items-start gap-3 bg-background p-4 rounded-lg border">
                  <Lock className="h-6 w-6 text-purple-500 flex-shrink-0 mt-1" />
                  <p className="text-sm">{t("summary.benefits.synchronization")}</p>
                </div>
                <div className="flex items-start gap-3 bg-background p-4 rounded-lg border">
                  <Eye className="h-6 w-6 text-blue-500 flex-shrink-0 mt-1" />
                  <p className="text-sm">{t("summary.benefits.visibility")}</p>
                </div>
                <div className="flex items-start gap-3 bg-background p-4 rounded-lg border">
                  <Bot className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" />
                  <p className="text-sm">{t("summary.benefits.automation")}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="text-center mt-12">
          <Link
            href="/"
            className="inline-block px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-md hover:shadow-lg transition-all"
          >
            {t("header.backButton")}
          </Link>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-muted py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-muted-foreground">
          <p>{t("footer.text")}</p>
        </div>
      </div>
    </div>
  )
}
