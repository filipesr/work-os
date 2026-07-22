import { getTranslations } from "next-intl/server";
import { Users } from "lucide-react";
import { getOneOnOneCadence, QUEUE_LIMIT } from "@/lib/actions/team-health";
import LogOneOnOneButton from "@/components/admin/LogOneOnOneButton";

// 1:1 cadence per member: last 1:1 / days since / overdue, with a one-click
// "register 1:1 today". Shows overdue members first (the ones that need it).
export default async function OneOnOneCadence() {
  const t = await getTranslations("admin.health.oneOnOne");
  const rows = await getOneOnOneCadence();
  if (rows.length === 0) return null;

  // Surface the ones needing attention: overdue first, capped like other queues.
  const shown = rows.slice(0, QUEUE_LIMIT);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-foreground" />
        <h3 className="text-lg font-bold text-foreground">{t("title")}</h3>
      </div>
      <ul className="divide-y divide-border">
        {shown.map((r) => (
          <li key={r.userId} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
              <span className="block text-xs text-muted-foreground">
                {r.daysSince === null ? t("never") : t("daysSince", { days: r.daysSince })}
                {r.overdue && (
                  <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400">
                    · {t("overdue")}
                  </span>
                )}
              </span>
            </div>
            <LogOneOnOneButton
              userId={r.userId}
              label={t("logButton")}
              successMessage={t("logged")}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
