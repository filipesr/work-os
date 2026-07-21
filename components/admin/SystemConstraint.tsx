import { getTranslations } from "next-intl/server";
import { AlertOctagon } from "lucide-react";
import { getSystemConstraint } from "@/lib/actions/team-health";
import { formatAge } from "@/lib/team-health-format";

// Theory-of-Constraints callout: names the SINGLE stage most blocking the
// system right now (inversion of the blocked queue's waitingOn), so managerial
// attention lands where finishing work raises throughput the most. Renders
// nothing when there is no active constraint (nothing blocked).
export default async function SystemConstraint() {
  const t = await getTranslations("admin.health.constraint");
  const constraint = await getSystemConstraint();
  if (!constraint) return null;

  return (
    <div className="rounded-xl border-2 border-rose-400 dark:border-rose-500 bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950 dark:to-orange-950 p-6">
      <div className="flex items-start gap-3">
        <AlertOctagon className="h-6 w-6 shrink-0 text-rose-600 dark:text-rose-400" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
            {t("title")}
          </h3>
          <p className="mt-1 text-xl font-bold text-rose-900 dark:text-rose-100">
            {constraint.stageName}
          </p>
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">
            {t("detail", {
              tasks: constraint.blockedTaskCount,
              wait: formatAge(constraint.totalWaitHours),
            })}
          </p>
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{t("hint")}</p>
        </div>
      </div>
    </div>
  );
}
