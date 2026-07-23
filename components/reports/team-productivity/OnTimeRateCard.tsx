import { getTranslations } from "next-intl/server";
import type { OnTimeRateResult } from "@/lib/actions/reporting";

interface OnTimeRateCardProps {
  data: OnTimeRateResult;
}

export async function OnTimeRateCard({ data }: OnTimeRateCardProps) {
  const t = await getTranslations("reportsTeam.onTime");
  const { overall, previousPercentage, byTeam } = data;

  const delta = overall.percentage - previousPercentage;
  const deltaSign = delta >= 0 ? "+" : "";
  const deltaText = t("delta", { value: `${deltaSign}${delta.toFixed(1)}` });
  const deltaClass =
    delta >= 0 ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300";

  if (overall.total === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-foreground mb-1">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("noData")}</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h2 className="text-lg font-bold text-foreground mb-2">{t("title")}</h2>
      <div className="flex flex-wrap items-baseline gap-3">
        <div className="text-5xl font-extrabold text-primary tabular-nums">
          {overall.percentage.toFixed(0)}%
        </div>
        <p className={`text-sm font-semibold ${deltaClass}`}>{deltaText}</p>
      </div>
      <p className="text-sm text-muted-foreground mt-2">
        {t("subtitle", { onTime: overall.onTime, total: overall.total })}
      </p>

      {byTeam.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-2">{t("byTeam")}</h3>
          <ul className="space-y-1.5">
            {byTeam.map((row) => (
              <li key={row.teamId} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{row.teamName}</span>
                <span className="font-semibold tabular-nums text-muted-foreground">
                  {row.percentage.toFixed(0)}%{" "}
                  <span className="text-xs font-normal text-muted-foreground/70">
                    ({row.onTime}/{row.total})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
