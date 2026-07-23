import type { LucideIcon } from "lucide-react";
import { toneBadgeClass, type Tone } from "@/lib/status-tone";

/** Badge de status/prioridade canônico (theme-aware, por tone). O rótulo já vem
 * traduzido pelo chamador — este componente é puramente presentacional.
 * Substitui os mapas de cor duplicados (§3). */
export function StatusBadge({
  tone,
  label,
  icon: Icon,
  className = "",
}: {
  tone: Tone;
  label: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${toneBadgeClass[tone]} ${className}`}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {label}
    </span>
  );
}
