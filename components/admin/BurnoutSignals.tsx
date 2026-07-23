import { getTranslations } from "next-intl/server";
import { HeartPulse } from "lucide-react";
import { getBurnoutSignals } from "@/lib/actions/team-health";

// Sustained-overload / burnout risk signals per member (utilization, overtime,
// WIP over the window). Renders nothing when no one is at risk. Indicative.
export default async function BurnoutSignals() {
  const t = await getTranslations("admin.health.burnout");
  const items = await getBurnoutSignals();
  if (items.length === 0) return null;

  return (
    <div className="bg-card shadow-lg rounded-xl border border-border p-6">
      <div className="mb-1 flex items-center gap-2">
        <HeartPulse className="h-5 w-5 text-rose-600 dark:text-rose-400" />
        <h3 className="text-lg font-bold text-foreground">{t("title")}</h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">{t("subtitle")}</p>
      <ul className="divide-y divide-border">
        {items.map((i) => {
          const reasons: string[] = [];
          if (i.avgUtilization != null)
            reasons.push(t("util", { pct: Math.round(i.avgUtilization * 100) }));
          if (i.overtimeWeeks > 0) reasons.push(t("overtime", { weeks: i.overtimeWeeks }));
          reasons.push(t("wip", { count: i.wipCount }));
          return (
            <li key={i.userId} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <span className="truncate text-sm font-medium text-foreground">{i.name}</span>
                <span className="block text-xs text-muted-foreground">{reasons.join(" · ")}</span>
              </div>
              <span
                className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
                  i.risk === "high"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                }`}
              >
                {t(i.risk)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
