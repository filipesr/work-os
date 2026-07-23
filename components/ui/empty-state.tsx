import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  /** `plain` = bloco centralizado dentro de outra seção; `card` = card
   * tracejado autônomo (ex.: coluna de resumo aguardando input). */
  variant?: "plain" | "card";
  className?: string;
}

/**
 * Estado vazio padrão (linguagem "nexo v2"), baseado em tokens. Duas formas:
 * `plain` (bloco centralizado) e `card` (card tracejado autônomo).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "plain",
  className = "",
}: EmptyStateProps) {
  const inner = (
    <div className="flex flex-col items-center justify-center px-4 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );

  if (variant === "card") {
    return (
      <section
        className={`rounded-xl border border-dashed border-border bg-card px-5 py-7 shadow-sm ${className}`}
      >
        {inner}
      </section>
    );
  }
  return <div className={`py-12 ${className}`}>{inner}</div>;
}
