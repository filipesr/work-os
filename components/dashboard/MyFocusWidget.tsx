import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getMyFocus } from "@/lib/actions/team-health";
import { formatAge } from "@/lib/team-health-format";

// Limite suave de WIP (Personal Kanban): acima disto, um nudge discreto.
const WIP_SOFT_LIMIT = 5;

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "red" | "amber";
}) {
  const color =
    tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-2xl font-bold tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

export async function MyFocusWidget() {
  const t = await getTranslations("dashboard.myFocus");
  const focus = await getMyFocus();

  // Sem trabalho ativo → nada a focar; esconde o bloco.
  if (focus.wip === 0) return null;

  const atRisk = focus.overdue + focus.dueSoon;

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <h2 className="text-lg font-bold text-foreground mb-4">{t("title")}</h2>

      <dl className="grid grid-cols-3 gap-3 mb-4">
        <Stat label={t("wip")} value={focus.wip} />
        <Stat label={t("aging")} value={focus.aging} tone={focus.aging ? "red" : "default"} />
        <Stat label={t("atRisk")} value={atRisk} tone={atRisk ? "amber" : "default"} />
      </dl>

      {focus.wip > WIP_SOFT_LIMIT && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          💡 {t("nudge", { count: focus.wip })}
        </p>
      )}

      {focus.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("attentionTitle")}
          </h3>
          <ul className="divide-y divide-border">
            {focus.items.slice(0, 6).map((i) => (
              <li key={`${i.taskId}-${i.stageName}`} className="py-2">
                <Link
                  href={`/tasks/${i.taskId}`}
                  className="block rounded-md px-2 py-1 -mx-2 hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {i.taskTitle}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatAge(i.ageHours)} ·{" "}
                      {t("slaMultiple", { ratio: i.agingRatio.toFixed(1) })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{i.stageName}</span>
                    {i.dueState !== "none" && (
                      <span
                        className={i.dueState === "overdue" ? "text-red-600" : "text-yellow-600"}
                      >
                        ●
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
