import type { Metadata } from "next";
import { requireManagerOrAdmin } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Relatórios",
};
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/prisma";
import { UserReportPicker } from "@/components/reports/UserReportPicker";
import { ReportCard } from "@/components/reports/ReportCard";

const REPORT_CARDS = [
  {
    key: "productivity",
    href: "/reports/productivity",
    iconBgClass: "bg-primary/10",
    accentTextClass: "text-primary",
    iconPath: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  {
    key: "performance",
    href: "/reports/performance",
    iconBgClass: "bg-orange-500/10",
    accentTextClass: "text-orange-500",
    iconPath: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  },
  {
    key: "liveActivity",
    href: "/reports/live-activity",
    iconBgClass: "bg-green-500/10",
    accentTextClass: "text-green-500",
    iconPath: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    key: "calendar",
    href: "/reports/calendar",
    iconBgClass: "bg-indigo-500/10",
    accentTextClass: "text-indigo-500",
    iconPath:
      "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    key: "calendarMonthly",
    href: "/reports/calendar/monthly",
    iconBgClass: "bg-indigo-500/10",
    accentTextClass: "text-indigo-500",
    iconPath:
      "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    key: "teamProductivity",
    href: "/reports/team-productivity",
    iconBgClass: "bg-indigo-500/10",
    accentTextClass: "text-indigo-500",
    iconPath: "M9 19V6h13M9 19a2 2 0 11-4 0 2 2 0 014 0zm12-4V6M3 6h18",
  },
] as const;

export default async function ReportsIndexPage() {
  // Check authorization
  try {
    await requireManagerOrAdmin();
  } catch (error) {
    redirect("/auth/signin");
  }

  const t = await getTranslations("reports.index");

  const collaborators = await prisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  const collaboratorOptions = collaborators.map((u) => ({
    id: u.id,
    name: u.name ?? u.email ?? u.id,
  }));

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Report Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {REPORT_CARDS.map((card) => (
          <ReportCard
            key={card.key}
            href={card.href}
            iconBgClass={card.iconBgClass}
            accentTextClass={card.accentTextClass}
            icon={
              <svg
                className={`h-6 w-6 ${card.accentTextClass}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d={card.iconPath}
                />
              </svg>
            }
            title={t(`${card.key}.title`)}
            description={t(`${card.key}.description`)}
            features={[
              t(`${card.key}.feature1`),
              t(`${card.key}.feature2`),
              t(`${card.key}.feature3`),
            ]}
          />
        ))}
      </div>

      {/* Individual collaborator report */}
      <Card>
        <CardHeader>
          <CardTitle>{t("userReport.title")}</CardTitle>
          <CardDescription>{t("userReport.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-sm">
            <UserReportPicker
              users={collaboratorOptions}
              placeholder={t("userReport.pickerPlaceholder")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <CardTitle className="text-lg">{t("guide.title")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-1">{t("guide.productivityLabel")}</p>
            <p className="text-muted-foreground">{t("guide.productivityText")}</p>
          </div>
          <div>
            <p className="font-semibold mb-1">{t("guide.performanceLabel")}</p>
            <p className="text-muted-foreground">{t("guide.performanceText")}</p>
          </div>
          <div>
            <p className="font-semibold mb-1">{t("guide.liveActivityLabel")}</p>
            <p className="text-muted-foreground">{t("guide.liveActivityText")}</p>
          </div>
          <div>
            <p className="font-semibold mb-1">{t("guide.tipLabel")}</p>
            <p className="text-muted-foreground">{t("guide.tipText")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
