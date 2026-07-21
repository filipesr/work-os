import { getTranslations } from "next-intl/server";
import { getTeamMemberLoad } from "@/lib/actions/team-health";
import { loadSegments } from "@/lib/team-health-format";

const SEGMENT_COLOR: Record<"overdue" | "dueSoon" | "onTrack", string> = {
  overdue: "bg-red-500",
  dueSoon: "bg-yellow-500",
  onTrack: "bg-green-500",
};

export default async function TeamLoadBalance() {
  const t = await getTranslations("admin.health.load");
  const rows = await getTeamMemberLoad();

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">{t("title")}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.userId} className="flex items-center gap-3">
              <span className="w-32 truncate text-sm font-medium text-foreground">{r.name}</span>
              <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden flex">
                {loadSegments(r).map((s) => (
                  <div
                    key={s.key}
                    className={SEGMENT_COLOR[s.key]}
                    style={{ width: `${s.pct}%` }}
                  />
                ))}
              </div>
              <span className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                {t("activeStages", { count: r.count })}
              </span>
              {r.overloaded && (
                <span className="text-xs font-bold text-red-700 bg-red-100 border border-red-300 rounded px-2 py-0.5">
                  {t("overloaded")}
                </span>
              )}
              {r.idle && !r.overloaded && (
                <span className="text-xs font-bold text-gray-600 bg-gray-100 border border-gray-300 rounded px-2 py-0.5">
                  {t("idle")}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
