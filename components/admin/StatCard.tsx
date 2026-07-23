import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  className?: string;
}

/**
 * Card de métrica (label + valor grande) — substitui o bloco
 * `bg-card shadow-lg rounded-xl border border-border p-6` duplicado nas
 * páginas admin de detalhe (clients/users/projects/teams).
 */
export function StatCard({ label, value, className = "" }: StatCardProps) {
  return (
    <div className={`rounded-xl border border-border bg-card p-6 shadow-sm ${className}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold text-foreground">{value}</p>
    </div>
  );
}
