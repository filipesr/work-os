import { getTranslations } from "next-intl/server";
import type { TeamLoadRow } from "@/lib/actions/reporting";

interface CurrentLoadGridProps {
  rows: TeamLoadRow[];
}

export async function CurrentLoadGrid({ rows }: CurrentLoadGridProps) {
  const t = await getTranslations("reportsTeam.load");

  const nonZero = rows.filter((r) => r.inProgress > 0);

  if (nonZero.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-1">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h2 className="text-lg font-bold text-foreground mb-1">{t("title")}</h2>
      <p className="text-sm text-muted-foreground mb-4">{t("subtitle")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {nonZero.map((row) => (
          <div key={row.teamId} className="border border-border rounded-lg p-4 bg-muted/20">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-bold text-foreground">{row.teamName}</h3>
              <span className="text-2xl font-extrabold text-primary tabular-nums">
                {row.inProgress}
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-success-subtle0" />
                  {t("onTrack")}
                </span>
                <span className="font-semibold tabular-nums">{row.onTrack}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-warning-subtle0" />
                  {t("attention")}
                </span>
                <span className="font-semibold tabular-nums">{row.attention}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-danger-subtle0" />
                  {t("overdue")}
                </span>
                <span className="font-semibold tabular-nums">{row.overdue}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
