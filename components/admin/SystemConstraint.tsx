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
    <div className="rounded-xl border border-danger/40 bg-danger-subtle p-6">
      <div className="flex items-start gap-3">
        <AlertOctagon className="h-6 w-6 shrink-0 text-danger" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-danger">
            {t("title")}
          </h3>
          <p className="mt-1 text-xl font-bold text-danger">{constraint.stageName}</p>
          <p className="mt-1 text-sm text-danger">
            {t("detail", {
              tasks: constraint.blockedTaskCount,
              wait: formatAge(constraint.totalWaitHours),
            })}
          </p>
          <p className="mt-2 text-xs text-danger">{t("hint")}</p>
        </div>
      </div>
    </div>
  );
}
