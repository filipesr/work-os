import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { requireSelfOrManager, getSessionUser, getUserRole } from "@/lib/permissions";
import { getTranslations } from "next-intl/server";
import { getUserProductivityReport } from "@/lib/actions/reporting";
import { currentMonthSaoPaulo, monthRangeSaoPaulo, formatMonthLabel } from "@/lib/dates";
import { Clock, CheckCircle2, Timer, Workflow, Info } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { PersonAnalytics } from "@/components/people/PersonAnalytics";
import { canReclassifyRework } from "@/lib/rework-policy";

export const metadata: Metadata = {
  title: "Relatório do Colaborador",
};

interface PageProps {
  params: Promise<{ userId: string; locale: string }>;
  searchParams: Promise<{ month?: string }>;
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold tracking-tight tabular-nums text-foreground">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

export default async function UserReportPage({ params, searchParams }: PageProps) {
  const { userId, locale } = await params;

  // Fail-closed: só a própria pessoa e gestor/admin (salvaguarda 5 da exceção
  // 3b). Antes era requireManagerOrAdmin, o que trancava a pessoa fora do
  // próprio relatório — o oposto de "auto-referenciado".
  let viewerId: string;
  try {
    await requireSelfOrManager(userId);
    viewerId = (await getSessionUser()).id as string;
  } catch {
    redirect("/auth/signin");
  }

  const role = await getUserRole();
  const canReclassify = canReclassifyRework({ viewerId, subjectId: userId, role });

  const { month: monthParam } = await searchParams;
  const month = monthParam || currentMonthSaoPaulo();
  const { start, end } = monthRangeSaoPaulo(month);

  const report = await getUserProductivityReport(userId, { from: start, to: end });
  if (!report.user) notFound();

  const t = await getTranslations("reports.userReport");
  const name = report.user.name || report.user.email || report.user.id;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        kicker={t("kicker")}
        title={name}
        subtitle={t("subtitle", { month: formatMonthLabel(month, locale) })}
        backHref="/reports"
        backLabel={t("back")}
      />

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            icon={Clock}
            label={t("totalHours")}
            value={`${report.totalHours.toFixed(1)}h`}
          />
          <StatTile
            icon={CheckCircle2}
            label={t("stagesCompleted")}
            value={`${report.stagesCompleted}`}
          />
          <StatTile
            icon={Timer}
            label={t("onTimeRate")}
            value={`${report.onTime.percentage.toFixed(0)}%`}
            hint={`${report.onTime.onTime}/${report.onTime.total}`}
          />
        </div>

        <SectionCard
          title={t("hoursByStage")}
          icon={Workflow}
          action={
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
          }
        >
          {report.hoursByStage.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noData")}</p>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 border-b border-border pb-2 text-sm font-semibold">
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
        </SectionCard>

        {/* A mesma analítica que a pessoa vê em /my-evolution — throughput,
            utilização em faixa, qualidade com os motivos, etapas ativas e horas.
            Vista pelo gestor, com o controle de reclassificar. */}
        <PersonAnalytics
          userId={userId}
          range={{ from: start, to: end }}
          canReclassify={canReclassify}
        />

        {/* Guard (P1/P2/P7): self-referential view, not a ranking. */}
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("guardNote")}
        </p>
      </div>
    </div>
  );
}
