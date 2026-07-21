import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getAgingStages, QUEUE_LIMIT } from "@/lib/actions/team-health";
import { formatAge } from "@/lib/team-health-format";

const DUE_BADGE: Record<"overdue" | "dueSoon", string> = {
  overdue: "bg-red-100 text-red-800 border-red-300",
  dueSoon: "bg-yellow-100 text-yellow-800 border-yellow-300",
};

export default async function AgingQueue() {
  const t = await getTranslations("admin.health.aging");
  const items = (await getAgingStages()).slice(0, QUEUE_LIMIT);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-foreground">{t("title")}</h3>
        <Link
          href="/reports/performance"
          className="text-xs font-medium text-primary hover:underline"
        >
          {t("seeAll")}
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <li key={`${i.taskId}-${i.stageName}`} className="py-2">
              <Link
                href={`/tasks/${i.taskId}`}
                className="block hover:bg-accent rounded-md px-2 py-1 -mx-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {i.taskTitle}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatAge(i.ageHours)} · {t("slaMultiple", { ratio: i.agingRatio.toFixed(1) })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{i.stageName}</span>
                  {i.assigneeName && <span>· {i.assigneeName}</span>}
                  {i.dueState !== "none" && (
                    <span
                      className={`ml-auto rounded px-1.5 py-0.5 border ${DUE_BADGE[i.dueState]}`}
                    >
                      {i.dueState === "overdue" ? "⚠" : "•"}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
