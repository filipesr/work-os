import Link from "next/link";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";

export default async function ReportsIndexPage() {
  // Check authorization
  try {
    await requireAnyRole([UserRole.ADMIN, UserRole.MANAGER]);
  } catch (error) {
    redirect("/auth/signin");
  }

  const t = await getTranslations("reports.index");

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Productivity Report */}
        <Link href="/reports/productivity">
          <Card className="hover:shadow-xl hover:border-primary transition-all duration-200 cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <CardTitle>{t("productivity.title")}</CardTitle>
                </div>
                <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <CardDescription>
                {t("productivity.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>{t("productivity.feature1")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>{t("productivity.feature2")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span>{t("productivity.feature3")}</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </Link>

        {/* Performance Report */}
        <Link href="/reports/performance">
          <Card className="hover:shadow-xl hover:border-primary transition-all duration-200 cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-orange-500/10 rounded-lg">
                  <svg className="h-6 w-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div className="flex-1">
                  <CardTitle>{t("performance.title")}</CardTitle>
                </div>
                <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <CardDescription>
                {t("performance.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-orange-500 font-bold">•</span>
                  <span>{t("performance.feature1")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500 font-bold">•</span>
                  <span>{t("performance.feature2")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500 font-bold">•</span>
                  <span>{t("performance.feature3")}</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </Link>

        {/* Live Activity Report */}
        <Link href="/reports/live-activity">
          <Card className="hover:shadow-xl hover:border-primary transition-all duration-200 cursor-pointer h-full">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-green-500/10 rounded-lg">
                  <svg className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <CardTitle>{t("liveActivity.title")}</CardTitle>
                </div>
                <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
              <CardDescription>
                {t("liveActivity.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">•</span>
                  <span>{t("liveActivity.feature1")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">•</span>
                  <span>{t("liveActivity.feature2")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 font-bold">•</span>
                  <span>{t("liveActivity.feature3")}</span>
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
            <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <CardTitle className="text-lg">{t("guide.title")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">{t("guide.productivityLabel")}</p>
            <p className="text-muted-foreground">
              {t("guide.productivityText")}
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">{t("guide.performanceLabel")}</p>
            <p className="text-muted-foreground">
              {t("guide.performanceText")}
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">{t("guide.liveActivityLabel")}</p>
            <p className="text-muted-foreground">
              {t("guide.liveActivityText")}
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1">{t("guide.tipLabel")}</p>
            <p className="text-muted-foreground">
              {t("guide.tipText")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
