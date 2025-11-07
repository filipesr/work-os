import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, CheckCircle2, XCircle, Users, FileText, Palette, Code, Search, Sparkles } from "lucide-react"
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

        {/* Step 6: Parallel Work */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="default" className="text-lg px-4 py-2">{t("step6.badge")}</Badge>
            <h2 className="text-3xl font-bold text-foreground">{t("step6.title")}</h2>
          </div>

          <Card className="border-purple-500/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Search className="h-6 w-6 text-purple-500" />
                <CardTitle>{t("step6.actor")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-purple-50 dark:bg-purple-950 border-2 border-purple-500 p-4 rounded-lg">
                <p className="flex items-center gap-2 font-semibold text-purple-700 dark:text-purple-300">
                  <Sparkles className="h-5 w-5" />
                  {t("step6.highlightTitle")}
                </p>
                <p className="mt-2 text-sm text-purple-600 dark:text-purple-400">
                  {t("step6.highlightText")}
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-semibold mb-2">{t("step6.qcTitle")}</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    <li>{t("step6.qcTasks.1")}</li>
                    <li>{t("step6.qcTasks.2")}</li>
                    <li>{t("step6.qcTasks.3")}</li>
                    <li>{t("step6.qcTasks.4")}</li>
                  </ul>
                </div>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="font-semibold mb-2">{t("step6.seoTitle")}</p>
                  <ul className="list-disc list-inside text-sm space-y-1">
                    <li>{t("step6.seoTasks.1")}</li>
                    <li>{t("step6.seoTasks.2")}</li>
                    <li>{t("step6.seoTasks.3")}</li>
                    <li>{t("step6.seoTasks.4")}</li>
                  </ul>
                </div>
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
