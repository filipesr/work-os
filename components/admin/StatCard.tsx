import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: ReactNode;
  className?: string;
}

/**
 * Card de métrica (label + valor grande) — substitui o bloco
 * `bg-card shadow-lg rounded-xl border-2 border-border p-6` duplicado nas
 * páginas admin de detalhe (clients/users/projects/teams).
 */
export function StatCard({ label, value, className = "" }: StatCardProps) {
  return (
    <div className={`bg-card shadow-lg rounded-xl border-2 border-border p-6 ${className}`}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}
