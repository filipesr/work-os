import type { LucideIcon } from "lucide-react";
import { toneIconClass, toneTextClass, type Tone } from "@/lib/status-tone";

export interface KpiItem {
  key: string;
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  icon?: LucideIcon;
}

/** Faixa de KPIs de exceção (Início / Meu Trabalho). Presentacional — os rótulos
 * e valores já vêm resolvidos pelo chamador. Componente canônico compartilhado
 * (§3: unificar StatsCards + MyStagesKPIs). */
export function PersonalKPIs({ items, columns = 5 }: { items: KpiItem[]; columns?: 5 | 6 }) {
  const lgCols = columns === 6 ? "lg:grid-cols-6" : "lg:grid-cols-5";
  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${lgCols}`}>
      {items.map((kpi) => {
        const tone: Tone = kpi.tone ?? "neutral";
        const Icon = kpi.icon;
        return (
          <div key={kpi.key} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm text-muted-foreground">{kpi.label}</span>
              {Icon ? (
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${toneIconClass[tone]}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              ) : null}
            </div>
            <div className={`mt-2 text-3xl font-bold ${toneTextClass[tone]}`}>{kpi.value}</div>
            {kpi.hint ? <div className="mt-1 text-xs text-muted-foreground">{kpi.hint}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
