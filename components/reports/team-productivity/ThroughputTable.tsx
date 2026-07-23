import { getTranslations } from "next-intl/server";
import type { TeamThroughputRow } from "@/lib/actions/reporting";

interface ThroughputTableProps {
  rows: TeamThroughputRow[];
}

export async function ThroughputTable({ rows }: ThroughputTableProps) {
  const t = await getTranslations("reportsTeam.throughput");

  const nonZero = rows.filter((r) => r.completedCount > 0 || r.previousCompletedCount > 0);
  if (nonZero.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-1">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-6 pb-3">
        <h2 className="text-lg font-bold text-foreground">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <table className="min-w-full">
        <thead className="bg-muted">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-bold text-foreground uppercase">
              {t("columns.team")}
            </th>
            <th className="px-6 py-3 text-right text-xs font-bold text-foreground uppercase">
              {t("columns.completed")}
            </th>
            <th className="px-6 py-3 text-right text-xs font-bold text-foreground uppercase">
              {t("columns.delta")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {nonZero.map((row) => {
            const delta = row.completedCount - row.previousCompletedCount;
            const deltaClass =
              delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted-foreground";
            return (
              <tr key={row.teamId}>
                <td className="px-6 py-3 text-sm font-medium text-foreground">{row.teamName}</td>
                <td className="px-6 py-3 text-sm text-right font-bold tabular-nums text-foreground">
                  {row.completedCount}
                </td>
                <td
                  className={`px-6 py-3 text-sm text-right font-semibold tabular-nums ${deltaClass}`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
