import { getTranslations } from "next-intl/server";
import {
  getPersonThroughputSeries,
  getPersonWorkload,
  getPersonUtilization,
  getPersonQuality,
  getPersonReworkEvents,
} from "@/lib/actions/person-metrics";
import { ThroughputLine } from "@/components/reports/FlowCharts";
import { monthRangeSaoPaulo, currentMonthSaoPaulo } from "@/lib/dates";

export async function MyGrowthWidget({ userId }: { userId: string }) {
  const t = await getTranslations("dashboard.growth");
  const { start, end } = monthRangeSaoPaulo(currentMonthSaoPaulo());
  const [throughput, workload, util, quality, reworkItems] = await Promise.all([
    getPersonThroughputSeries(userId, 8),
    getPersonWorkload(userId),
    getPersonUtilization(userId, { from: start, to: end }),
    getPersonQuality(userId, { from: start, to: end }),
    getPersonReworkEvents(userId, 10),
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

      {/* Qualidade própria (defeito-only, read-only — sem reclassificar) */}
      <div className="mt-5 pt-5 border-t border-border">
        <h3 className="text-sm font-bold text-foreground mb-1">{t("qualityTitle")}</h3>
        <p className="text-xs text-muted-foreground mb-3">{t("selfReferencedNote")}</p>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-2xl font-bold text-foreground">
            {quality.firstTimeRight == null ? "—" : `${Math.round(quality.firstTimeRight * 100)}%`}
          </span>
          <span className="text-xs text-muted-foreground">{t("ftr")}</span>
        </div>
        {reworkItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noReturns")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {reworkItems.map((r) => (
              <li key={r.id} className="py-2">
                <div className="text-sm font-medium truncate">{r.taskTitle}</div>
                <div className="text-xs text-muted-foreground">
                  {r.sourceStageName} · {t(r.kind === "INTERNAL" ? "kindInternal" : "kindClient")}
                </div>
                {r.reason && (
                  <div className="text-xs italic text-muted-foreground">“{r.reason}”</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
