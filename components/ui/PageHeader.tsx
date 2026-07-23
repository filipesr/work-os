import { type ReactNode } from "react";
import { BackLink } from "./BackLink";

/**
 * Cabeçalho de página padrão (linguagem "nexo v2"): kicker de escopo + título
 * + subtítulo, com slot opcional de ações à direita e um BackLink acima.
 * Usado por todas as telas para um header consistente.
 * Ver docs/arquitetura-de-informacao.md §6.
 */
export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
  backHref,
  backLabel,
  className = "",
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <header className={`mb-6 ${className}`}>
      {backHref && backLabel && (
        <div className="mb-3">
          <BackLink href={backHref} label={backLabel} />
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          {kicker && <p className="text-sm font-medium text-primary">{kicker}</p>}
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-sm leading-6 text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
