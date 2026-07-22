import { getTranslations } from "next-intl/server";
import {
  getPersonThroughputSeries,
  getPersonWorkload,
  getPersonUtilization,
} from "@/lib/actions/person-metrics";
import { ThroughputLine } from "@/components/reports/FlowCharts";
import { monthRangeSaoPaulo, currentMonthSaoPaulo } from "@/lib/dates";

export async function MyGrowthWidget({ userId }: { userId: string }) {
  const t = await getTranslations("dashboard.growth");
  const { start, end } = monthRangeSaoPaulo(currentMonthSaoPaulo());
  const [throughput, workload, util] = await Promise.all([
    getPersonThroughputSeries(userId, 8),
    getPersonWorkload(userId),
    getPersonUtilization(userId, { from: start, to: end }),
  ]);
  const pct = util.utilization == null ? null : Math.round(util.utilization * 100);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <h2 className="text-lg font-bold text-foreground mb-1">{t("title")}</h2>
      <p className="text-xs text-muted-foreground mb-3">{t("selfReferencedNote")}</p>
      {throughput.some((p) => p.count > 0) ? (
        <ThroughputLine points={throughput} label={t("title")} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("throughputEmpty")}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        <span className="text-muted-foreground">
          {t("wip", { wip: workload.wip, aging: workload.aging })}
        </span>
        <span className="text-muted-foreground">
          {pct == null ? t("utilizationNoTarget") : t("utilization", { pct })}
        </span>
      </div>
    </div>
  );
}
