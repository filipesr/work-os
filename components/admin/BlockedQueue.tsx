import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getBlockedStages, QUEUE_LIMIT } from "@/lib/actions/team-health";
import { formatAge } from "@/lib/team-health-format";

export default async function BlockedQueue() {
  const t = await getTranslations("admin.health.blocked");
  const items = (await getBlockedStages()).slice(0, QUEUE_LIMIT);

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">{t("title")}</h3>
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
                    {formatAge(i.ageHours)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span>{i.stageName}</span>
                  {i.assigneeName && <span> · {i.assigneeName}</span>}
                  <span className="block">
                    {i.waitingOn.length
                      ? t("waitingOn", { stages: i.waitingOn.join(", ") })
                      : t("waitingGeneric")}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
