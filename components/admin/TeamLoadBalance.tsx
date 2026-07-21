import { getTranslations } from "next-intl/server";
import { getTeamMemberLoad, median, type MemberLoad } from "@/lib/actions/team-health";
import { loadSegments } from "@/lib/team-health-format";

type LoadT = Awaited<ReturnType<typeof getTranslations<"admin.health.load">>>;

const SEGMENT_COLOR: Record<"overdue" | "dueSoon" | "onTrack", string> = {
  overdue: "bg-red-500",
  dueSoon: "bg-yellow-500",
  onTrack: "bg-green-500",
};

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "red" | "muted";
}) {
  const color =
    tone === "red"
      ? "text-red-700"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-xl font-bold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

function MemberRow({ row, t }: { row: MemberLoad; t: LoadT }) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-32 truncate text-sm font-medium text-foreground">{row.name}</span>
      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden flex">
        {loadSegments(row).map((s) => (
          <div key={s.key} className={SEGMENT_COLOR[s.key]} style={{ width: `${s.pct}%` }} />
        ))}
      </div>
      <span className="w-20 text-right text-sm tabular-nums text-muted-foreground">
        {t("activeStages", { count: row.count })}
      </span>
    </li>
  );
}

export default async function TeamLoadBalance() {
  const t = await getTranslations("admin.health.load");
  const rows = await getTeamMemberLoad();

  const overloaded = rows.filter((r) => r.overloaded);
  const idle = rows.filter((r) => r.idle && !r.overloaded);
  const medianWip = median(rows.map((r) => r.count));

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">{t("title")}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          {/* Summary — management by exception: totals, not 40 rows */}
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Stat label={t("summary.total")} value={rows.length} />
            <Stat label={t("summary.overloaded")} value={overloaded.length} tone="red" />
            <Stat label={t("summary.idle")} value={idle.length} tone="muted" />
            <Stat label={t("summary.medianWip")} value={medianWip} />
          </dl>

          {/* Only the outliers that need action */}
          {overloaded.length === 0 && idle.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("balanced")}</p>
          ) : (
            <div className="space-y-4">
              {overloaded.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-red-700 mb-2">
                    {t("overloadedTitle", { count: overloaded.length })}
                  </h4>
                  <ul className="space-y-3">
                    {overloaded.map((r) => (
                      <MemberRow key={r.userId} row={r} t={t} />
                    ))}
                  </ul>
                </div>
              )}
              {idle.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    {t("idleTitle", { count: idle.length })}
                  </h4>
                  <ul className="space-y-3">
                    {idle.map((r) => (
                      <MemberRow key={r.userId} row={r} t={t} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Full roster on demand (native disclosure — no client JS) */}
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-medium text-primary hover:underline">
              {t("seeAll", { count: rows.length })}
            </summary>
            <ul className="mt-3 space-y-3">
              {rows.map((r) => (
                <MemberRow key={r.userId} row={r} t={t} />
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
