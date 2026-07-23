import { getTranslations } from "next-intl/server";
import type { StageDurationRow } from "@/lib/actions/reporting";
import { ExportButtons } from "@/components/reports/ExportButtons";

interface StageDurationTableProps {
  rows: StageDurationRow[];
}

export async function StageDurationTable({ rows }: StageDurationTableProps) {
  const t = await getTranslations("reportsTeam.stageDuration");

  const exportRows = rows.map((r) => ({
    stage: r.stageName,
    template: r.templateName,
    avgHours: Number(r.avgDurationHours.toFixed(2)),
    slaHours: r.expectedDurationHours ?? "",
    slaStatus: r.expectedDurationHours === null ? "" : r.withinSla ? t("onSla") : t("overSla"),
    samples: r.sampleSize,
  }));
  const exportColumns = [
    { key: "stage" as const, header: t("columns.stage") },
    { key: "template" as const, header: t("columns.template") },
    { key: "avgHours" as const, header: t("columns.avgDuration") },
    { key: "slaHours" as const, header: t("columns.sla") },
    { key: "slaStatus" as const, header: "SLA" },
    { key: "samples" as const, header: t("columns.sampleSize") },
  ];

  const formatDuration = (hours: number): string => {
    if (hours >= 1) {
      const whole = Math.floor(hours);
      const mins = Math.round((hours - whole) * 60);
      if (mins === 0) return t("hoursShort", { hours: whole });
      return `${t("hoursShort", { hours: whole })} ${t("minutesShort", { minutes: mins })}`;
    }
    return t("minutesShort", { minutes: Math.round(hours * 60) });
  };

  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-1">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-6 pb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <ExportButtons
          filename="stage-duration"
          title={t("title")}
          columns={exportColumns}
          rows={exportRows}
        />
      </div>
      <table className="min-w-full">
        <thead className="bg-muted">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-bold text-foreground uppercase">
              {t("columns.stage")}
            </th>
            <th className="px-6 py-3 text-left text-xs font-bold text-foreground uppercase">
              {t("columns.template")}
            </th>
            <th className="px-6 py-3 text-right text-xs font-bold text-foreground uppercase">
              {t("columns.avgDuration")}
            </th>
            <th className="px-6 py-3 text-right text-xs font-bold text-foreground uppercase">
              {t("columns.sla")}
            </th>
            <th className="px-6 py-3 text-right text-xs font-bold text-foreground uppercase">
              {t("columns.sampleSize")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.stageId}>
              <td className="px-6 py-3 text-sm font-medium text-foreground">{row.stageName}</td>
              <td className="px-6 py-3 text-sm text-muted-foreground">{row.templateName}</td>
              <td className="px-6 py-3 text-sm text-right font-bold tabular-nums text-foreground">
                {formatDuration(row.avgDurationHours)}
              </td>
              <td className="px-6 py-3 text-sm text-right tabular-nums">
                {row.expectedDurationHours === null ? (
                  <span className="text-muted-foreground">{t("noSla")}</span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                      row.withinSla
                        ? "bg-success-subtle text-success"
                        : "bg-danger-subtle text-danger"
                    }`}
                  >
                    {row.expectedDurationHours}h · {row.withinSla ? t("onSla") : t("overSla")}
                  </span>
                )}
              </td>
              <td className="px-6 py-3 text-sm text-right tabular-nums text-muted-foreground">
                {row.sampleSize}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
