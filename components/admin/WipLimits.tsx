import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { getWipStatus } from "@/lib/actions/team-health";

// WIP-limit breaches: stages at (full) or over their configured WIP limit.
// Renders nothing when every limited stage is within its limit.
export default async function WipLimits() {
  const t = await getTranslations("admin.health.wip");
  const items = await getWipStatus();
  if (items.length === 0) return null;

  return (
    <div className="bg-card shadow-lg rounded-xl border border-border p-6">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <h3 className="text-lg font-bold text-foreground">{t("title")}</h3>
      </div>
      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.stageId} className="flex items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <span className="truncate text-sm font-medium text-foreground">{i.stageName}</span>
              {i.teamName && (
                <span className="block text-xs text-muted-foreground">{i.teamName}</span>
              )}
            </div>
            <span
              className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
                i.state === "over"
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              }`}
            >
              {i.inProgress}/{i.limit} · {t(i.state)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
