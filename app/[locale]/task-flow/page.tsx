import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  GitBranch,
  GitMerge,
  Layers,
  Lock,
  MessageSquareWarning,
  PauseCircle,
  Shuffle,
  TrendingDown,
  Users,
  Workflow,
  Tv,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

const PROBLEM_ICONS = {
  flow: AlertTriangle,
  reuse: Shuffle,
  parallel: PauseCircle,
  assignment: MessageSquareWarning,
  timesheet: TrendingDown,
  visibility: Eye,
} as const;

const SOLUTION_ICONS = {
  template: Workflow,
  assignment: Users,
  parallel: GitBranch,
  validation: Lock,
  timesheet: Clock,
  visibility: Layers,
} as const;

const BONUS_LINKS = {
  calendar: { href: "/reports/calendar", icon: Calendar },
  productivity: { href: "/reports/team-productivity", icon: TrendingUp },
  live: { href: "/reports/live-activity", icon: Tv },
  timesheet: { href: "/reports/productivity", icon: FileText },
} as const;

export default async function TaskFlowPresentation() {
  const t = await getTranslations("taskFlow");

  const problemKeys = [
    "flow",
    "reuse",
    "parallel",
    "assignment",
    "timesheet",
    "visibility",
  ] as const;
  const solutionKeys = [
    "template",
    "assignment",
    "parallel",
    "validation",
    "timesheet",
    "visibility",
  ] as const;
  const stepKeys = ["1", "2", "3", "4", "5", "6", "7"] as const;
  const bonusKeys = ["calendar", "productivity", "live", "timesheet"] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* HERO */}
      <header className="bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <span className="inline-block px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-bold uppercase tracking-widest">
            {t("hero.eyebrow")}
          </span>
          <h1 className="text-5xl md:text-6xl font-extrabold mt-4 leading-tight">
            {t("hero.title")}
          </h1>
          <p className="text-xl opacity-90 mt-4 max-w-3xl">{t("hero.subtitle")}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 mt-8 px-6 py-3 bg-white text-primary font-semibold rounded-lg hover:bg-white/90 transition-all shadow-md"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            {t("hero.back")}
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12 space-y-16">
        {/* INTRO */}
        <section>
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-3xl">{t("intro.title")}</CardTitle>
              <CardDescription className="text-base">{t("intro.body")}</CardDescription>
            </CardHeader>
          </Card>
        </section>

        {/* PROBLEMS */}
        <section>
          <header className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-foreground">{t("problems.title")}</h2>
            <p className="text-muted-foreground mt-2">{t("problems.subtitle")}</p>
          </header>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {problemKeys.map((key) => {
              const Icon = PROBLEM_ICONS[key];
              return (
                <Card
                  key={key}
                  className="border-l-4 border-l-red-500/70 hover:border-l-red-500 transition-colors"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-1">
                      <div className="p-2 bg-red-500/10 rounded-lg">
                        <Icon className="h-5 w-5 text-red-600 dark:text-red-400" />
                      </div>
                      <CardTitle className="text-base">
                        {t(`problems.cards.${key}.title`)}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t(`problems.cards.${key}.text`)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* SOLUTION */}
        <section>
          <header className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-foreground">{t("solution.title")}</h2>
            <p className="text-muted-foreground mt-2">{t("solution.subtitle")}</p>
          </header>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {solutionKeys.map((key) => {
              const Icon = SOLUTION_ICONS[key];
              return (
                <Card
                  key={key}
                  className="border-l-4 border-l-emerald-500/70 hover:border-l-emerald-500 transition-colors"
                >
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-1">
                      <div className="p-2 bg-emerald-500/10 rounded-lg">
                        <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <CardTitle className="text-base">
                        {t(`solution.cards.${key}.title`)}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {t(`solution.cards.${key}.text`)}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* FLOW */}
        <section>
          <header className="mb-8 text-center">
            <h2 className="text-3xl font-bold text-foreground">{t("flow.title")}</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">{t("flow.intro")}</p>
            <div className="mt-4 inline-block bg-muted px-4 py-2 rounded-lg text-sm font-mono text-foreground">
              {t("flow.stages")}
            </div>
          </header>

          <ol className="space-y-4">
            {stepKeys.map((key, idx) => {
              const isFork = key === "6";
              const isJoin = key === "7";
              const isLoop = key === "4";
              const accentClass = isFork
                ? "border-l-purple-500"
                : isJoin
                  ? "border-l-orange-500"
                  : isLoop
                    ? "border-l-amber-500"
                    : "border-l-primary";
              return (
                <li key={key} className={`relative pl-2 border-l-4 ${accentClass} rounded-lg`}>
                  <Card className="ml-1">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-4">
                        <span
                          className={`flex-shrink-0 inline-flex items-center justify-center min-w-[2.5rem] h-10 px-3 rounded-full font-bold text-lg ${
                            isFork
                              ? "bg-purple-500 text-white"
                              : isJoin
                                ? "bg-orange-500 text-white"
                                : isLoop
                                  ? "bg-amber-500 text-white"
                                  : "bg-primary text-primary-foreground"
                          }`}
                          aria-hidden="true"
                        >
                          {t(`flow.steps.${key}.badge`)}
                        </span>
                        <div className="flex-1">
                          <CardTitle className="text-xl">{t(`flow.steps.${key}.title`)}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1 font-medium">
                            {t(`flow.steps.${key}.actor`)}
                          </p>
                        </div>
                        {isFork && <GitBranch className="h-6 w-6 text-purple-500" />}
                        {isJoin && <GitMerge className="h-6 w-6 text-orange-500" />}
                        {isLoop && <MessageSquareWarning className="h-6 w-6 text-amber-500" />}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-base text-foreground leading-relaxed">
                        {t(`flow.steps.${key}.text`)}
                      </p>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ol>
        </section>

        {/* BONUS - REPORTS */}
        <section>
          <header className="mb-8 text-center">
            <Badge variant="default" className="mb-3 bg-amber-500 hover:bg-amber-500">
              Bônus
            </Badge>
            <h2 className="text-3xl font-bold text-foreground">{t("bonus.title")}</h2>
            <p className="text-muted-foreground mt-2 max-w-3xl mx-auto">{t("bonus.intro")}</p>
          </header>
          <div className="grid md:grid-cols-2 gap-5">
            {bonusKeys.map((key) => {
              const { href, icon: Icon } = BONUS_LINKS[key];
              return (
                <Link key={key} href={href} className="group">
                  <Card className="h-full hover:shadow-xl hover:border-primary transition-all duration-200">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-amber-500/10 rounded-lg">
                          <Icon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                        </div>
                        <CardTitle className="flex-1">{t(`bonus.cards.${key}.title`)}</CardTitle>
                        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {t(`bonus.cards.${key}.text`)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* CLOSER */}
        <section>
          <Card className="bg-gradient-to-br from-primary/15 via-primary/5 to-background border-primary/30">
            <CardHeader>
              <CardTitle className="text-3xl md:text-4xl flex items-center gap-3">
                <CheckCircle2 className="h-9 w-9 text-primary flex-shrink-0" />
                <span>{t("closer.title")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg text-foreground leading-relaxed">{t("closer.body")}</p>
              <div className="mt-6">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 shadow-md hover:shadow-lg transition-all"
                >
                  {t("hero.back")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="bg-muted py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>{t("footer.text")}</p>
        </div>
      </footer>
    </div>
  );
}
