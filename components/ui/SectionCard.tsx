import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";

/**
 * Card de seção padrão (linguagem "nexo v2"): borda + sombra suave, com um
 * header opcional (ícone, título, subtítulo, badge e/ou ação) separado por
 * divisória, e corpo com padding. Substitui o `rounded-xl border bg-card
 * shadow-sm` repetido em dezenas de telas.
 */
export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  badge,
  action,
  children,
  className = "",
  bodyClassName = "p-6",
  headerClassName = "",
}: {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  headerClassName?: string;
}) {
  const hasHeader = Boolean(title || subtitle || badge || action);
  return (
    <section className={`rounded-xl border border-border bg-card shadow-sm ${className}`}>
      {hasHeader && (
        <div
          className={`flex items-start justify-between gap-3 border-b border-border p-6 ${headerClassName}`}
        >
          <div className="flex items-start gap-3">
            {Icon && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
              {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {(action || badge) && (
            <div className="flex shrink-0 items-center gap-2">
              {action}
              {badge}
            </div>
          )}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
