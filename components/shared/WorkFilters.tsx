"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FilterX } from "lucide-react";

export type WorkScope = "mine" | "team";
export type WorkStatus = "active" | "blocked" | "completed" | "overdue";

const STATUSES: WorkStatus[] = ["active", "blocked", "completed", "overdue"];
const STATUS_LABEL_KEY: Record<WorkStatus, string> = {
  active: "statusActive",
  blocked: "statusBlocked",
  completed: "statusCompleted",
  overdue: "statusOverdue",
};

/** Barra de filtro da fila do colaborador (§3: um sistema de filtro, URL-driven).
 * Escopo (Minhas/Do time) · pílulas de status · intervalo de vencimento · limpar. */
export function WorkFilters({
  scope,
  status,
  from,
  to,
}: {
  scope: WorkScope;
  status: WorkStatus | null;
  from: string;
  to: string;
}) {
  const t = useTranslations("tasks.myWork");
  const tFlow = useTranslations("common.flow");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const push = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(params.toString());
    mut(p);
    router.push(`${pathname}?${p.toString()}`);
  };
  const setParam = (key: string, value: string | null) =>
    push((p) => (value ? p.set(key, value) : p.delete(key)));

  const hasFilters = scope !== "mine" || status !== null || from !== "" || to !== "";

  const pillBase =
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        {/* Escopo */}
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("scope")}
          </div>
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {(["mine", "team"] as WorkScope[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setParam("scope", s === "mine" ? null : s)}
                aria-pressed={scope === s}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  scope === s
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s === "mine" ? t("scopeMine") : t("scopeTeam")}
              </button>
            ))}
          </div>
        </div>

        {/* Status */}
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("statusLabel")}
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const active = status === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setParam("status", active ? null : s)}
                  aria-pressed={active}
                  className={`${pillBase} ${
                    active
                      ? "bg-primary/10 text-primary"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tFlow(STATUS_LABEL_KEY[s])}
                </button>
              );
            })}
          </div>
        </div>

        {/* Vencimento */}
        <div className="flex items-end gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("from")}
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => setParam("from", e.target.value || null)}
              className="h-9 rounded-lg border border-input-border bg-input px-2 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("to")}
            </span>
            <input
              type="date"
              value={to}
              onChange={(e) => setParam("to", e.target.value || null)}
              className="h-9 rounded-lg border border-input-border bg-input px-2 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none"
            />
          </label>
        </div>

        {/* Limpar */}
        {hasFilters ? (
          <button
            type="button"
            onClick={() => router.push(pathname)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FilterX className="h-4 w-4" aria-hidden="true" />
            {t("clear")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
