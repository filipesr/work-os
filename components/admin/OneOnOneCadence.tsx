import { getTranslations, getLocale } from "next-intl/server";
import { Users } from "lucide-react";
import { getOneOnOneCadence, QUEUE_LIMIT } from "@/lib/actions/team-health";
import LogOneOnOneButton from "@/components/admin/LogOneOnOneButton";

// 1:1 cadence per member: last 1:1 / days since / overdue, with a one-click
// "register 1:1 today" AND an expandable history of the recorded 1:1s. Overdue
// members first.
export default async function OneOnOneCadence() {
  const t = await getTranslations("admin.health.oneOnOne");
  const locale = await getLocale();
  const rows = await getOneOnOneCadence();
  if (rows.length === 0) return null;

  const fmt = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const shown = rows.slice(0, QUEUE_LIMIT);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-foreground" />
        <h3 className="text-lg font-bold text-foreground">{t("title")}</h3>
      </div>
      <ul className="divide-y divide-border">
        {shown.map((r) => (
          <li key={r.userId} className="py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {r.lastOneOnOne ? (
                    <>
                      {t("last", { date: fmt.format(new Date(r.lastOneOnOne)) })} ·{" "}
                      {t("daysSince", { days: r.daysSince ?? 0 })}
                    </>
                  ) : (
                    t("never")
                  )}
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
            </div>
            {r.recent.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  {t("historyToggle", { count: r.recent.length })}
                </summary>
                <ul className="mt-1 space-y-1 pl-2">
                  {r.recent.map((e, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {fmt.format(new Date(e.occurredAt))}
                      </span>
                      {e.managerName && <span> · {e.managerName}</span>}
                      {e.notes && <span className="block italic">“{e.notes}”</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
