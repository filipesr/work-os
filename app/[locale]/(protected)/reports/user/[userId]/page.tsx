import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireManagerOrAdmin } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import { getUserProductivityReport } from "@/lib/actions/reporting";
import { currentMonthSaoPaulo, monthRangeSaoPaulo, formatMonthLabel } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { ExportButtons } from "@/components/reports/ExportButtons";

export const metadata: Metadata = {
  title: "Relatório do Colaborador",
};

interface PageProps {
  params: Promise<{ userId: string; locale: string }>;
  searchParams: Promise<{ month?: string }>;
}

export default async function UserReportPage({ params, searchParams }: PageProps) {
  try {
    await requireManagerOrAdmin();
  } catch {
    redirect("/auth/signin");
  }

  const { userId, locale } = await params;
  const { month: monthParam } = await searchParams;
  const month = monthParam || currentMonthSaoPaulo();
  const { start, end } = monthRangeSaoPaulo(month);

  const report = await getUserProductivityReport(userId, { from: start, to: end });
  if (!report.user) notFound();

  const t = await getTranslations("reports.userReport");
  const name = report.user.name || report.user.email || report.user.id;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <Link
          href="/reports"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("back")}
        </Link>
        <h1 className="text-3xl font-bold text-foreground">{name}</h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", { month: formatMonthLabel(month, locale) })}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("totalHours")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{report.totalHours.toFixed(1)}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("stagesCompleted")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">{report.stagesCompleted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{t("onTimeRate")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold tabular-nums">
              {report.onTime.percentage.toFixed(0)}%
            </p>
            <p className="text-xs text-muted-foreground">
              {report.onTime.onTime}/{report.onTime.total}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <CardTitle>{t("hoursByStage")}</CardTitle>
          <ExportButtons
            filename={`relatorio-${name}`}
            title={`${name} — ${t("hoursByStage")}`}
            columns={[
              { key: "stage", header: t("stageHeader") },
              { key: "hours", header: t("hoursHeader") },
            ]}
            rows={report.hoursByStage.map((s) => ({
              stage: s.stageName,
              hours: Number(s.totalHours.toFixed(1)),
            }))}
          />
        </CardHeader>
        <CardContent>
          {report.hoursByStage.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noData")}</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 pb-2 border-b font-semibold text-sm">
                <div>{t("stageHeader")}</div>
                <div className="text-right">{t("hoursHeader")}</div>
              </div>
              {report.hoursByStage.map((s) => (
                <div key={s.stageId} className="grid grid-cols-2 gap-2 text-sm">
                  <div className="truncate">{s.stageName}</div>
                  <div className="text-right font-medium tabular-nums">
                    {s.totalHours.toFixed(1)}h
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
