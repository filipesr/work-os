"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  loadMeter,
  medianMarkerPct,
  type LoadTier,
  type MemberStage,
} from "@/lib/team-health-format";
import { getMemberActiveStages } from "@/lib/actions/member-drill";
import { formatDisplayDate } from "@/lib/dates";
import type { MemberLoad } from "@/lib/actions/team-health";

const TIER_COLOR: Record<LoadTier, string> = {
  idle: "bg-muted-foreground/30",
  healthy: "bg-green-500",
  high: "bg-amber-500",
  overloaded: "bg-red-500",
};

type Filter = "all" | "overloaded" | "idle" | "active";

interface Summary {
  total: number;
  overloaded: number;
  idle: number;
  medianWip: number;
  ceiling: number;
}

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

export function TeamLoadBalanceClient({ rows, summary }: { rows: MemberLoad[]; summary: Summary }) {
  const t = useTranslations("admin.health.load");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<MemberLoad | null>(null);
  const [stages, setStages] = useState<MemberStage[]>([]);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    switch (filter) {
      case "overloaded":
        return rows.filter((r) => r.overloaded);
      case "idle":
        return rows.filter((r) => r.idle && !r.overloaded);
      case "active":
        return rows.filter((r) => r.count > 0);
      default:
        return rows;
    }
  }, [rows, filter]);

  // Quando quase todo mundo está ocioso, o badge "Ocioso" vira ruído (é a norma,
  // não exceção) — só mostra quando ociosos NÃO são maioria.
  const idleIsMajority = summary.total > 0 && summary.idle > summary.total / 2;

  const openMember = (m: MemberLoad) => {
    setSelected(m);
    setStages([]);
    startTransition(async () => {
      setStages(await getMemberActiveStages(m.userId));
    });
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: t("filters.all") },
    { key: "overloaded", label: t("filters.overloaded") },
    { key: "idle", label: t("filters.idle") },
    { key: "active", label: t("filters.active") },
  ];

  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">{t("title")}</h3>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label={t("summary.total")} value={summary.total} />
            <Stat label={t("summary.overloaded")} value={summary.overloaded} tone="red" />
            <Stat label={t("summary.idle")} value={summary.idle} tone="muted" />
            <Stat label={t("summary.medianWip")} value={summary.medianWip} />
          </dl>

          <div className="flex flex-wrap gap-2 mb-3">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors ${
                  filter === f.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-accent"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t("noMatch")}</p>
          ) : (
            <>
              <ul className="max-h-80 overflow-y-auto divide-y divide-border">
                {filtered.map((r) => {
                  const meter = loadMeter(r, summary.ceiling);
                  return (
                    <li key={r.userId}>
                      <button
                        type="button"
                        onClick={() => openMember(r)}
                        className="w-full flex items-center gap-3 px-2 py-2 text-left rounded-md hover:bg-accent"
                      >
                        <span className="w-32 truncate text-sm font-medium text-foreground">
                          {r.name}
                        </span>
                        {/* WIP load meter: fill = WIP ÷ overload ceiling, colored
                            by load tier; the vertical marker is the team median. */}
                        <div className="relative flex-1 h-3 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${TIER_COLOR[meter.tier]}`}
                            style={{ width: `${meter.fillPct}%` }}
                          />
                          {summary.medianWip > 0 && (
                            <span
                              className="absolute top-0 h-full w-px bg-foreground/50"
                              style={{
                                left: `${medianMarkerPct(summary.medianWip, summary.ceiling)}%`,
                              }}
                              title={t("medianMarker", { median: summary.medianWip })}
                            />
                          )}
                        </div>
                        <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                          {t("activeStages", { count: r.count })}
                        </span>
                        {r.overloaded && (
                          <span className="shrink-0 text-xs font-bold text-red-700 bg-red-100 border border-red-300 rounded px-2 py-0.5">
                            {t("overloaded")}
                          </span>
                        )}
                        {r.idle && !r.overloaded && !idleIsMajority && (
                          <span className="shrink-0 text-xs font-bold text-gray-600 bg-gray-100 border border-gray-300 rounded px-2 py-0.5">
                            {t("idle")}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[11px] text-muted-foreground">
                {t("meterLegend", { ceiling: summary.ceiling })}
              </p>
            </>
          )}
        </>
      )}

      <Dialog open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("drawer.title", { name: selected?.name ?? "" })}</DialogTitle>
          </DialogHeader>
          {isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("drawer.loading")}
            </div>
          ) : stages.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t("drawer.empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {stages.map((s) => (
                <li key={`${s.taskId}-${s.stageName}`} className="py-3">
                  <Link
                    href={`/tasks/${s.taskId}`}
                    className="block rounded-md px-2 py-1.5 -mx-2 hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {s.taskTitle}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        · {s.stageName}
                      </span>
                    </div>
                    <dl className="mt-1.5 grid grid-cols-3 gap-2">
                      <div>
                        <dt className="text-[11px] text-muted-foreground">
                          {t("drawer.createdAt")}
                        </dt>
                        <dd className="text-xs font-medium text-foreground">
                          {formatDisplayDate(s.createdAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">
                          {t("drawer.assignedAt")}
                        </dt>
                        <dd className="text-xs font-medium text-foreground">
                          {formatDisplayDate(s.assignedAt)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">{t("drawer.dueDate")}</dt>
                        <dd
                          className={`text-xs font-medium ${
                            s.dueState === "overdue"
                              ? "text-red-700"
                              : s.dueState === "dueSoon"
                                ? "text-yellow-700"
                                : "text-foreground"
                          }`}
                        >
                          {formatDisplayDate(s.dueDate)}
                        </dd>
                      </div>
                    </dl>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
