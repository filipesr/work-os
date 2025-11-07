/**
 * Dashboard Skeleton Components
 *
 * Componentes de loading para melhorar UX percebida durante carregamento do dashboard.
 * Usa animate-pulse do Tailwind para efeito de "breathing".
 */

// Skeleton para cards de estatísticas
export function StatsCardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="bg-card p-4 rounded-lg border shadow-sm animate-pulse"
        >
          {/* Label skeleton */}
          <div className="h-4 bg-muted rounded w-3/4 mb-3" />
          {/* Number skeleton */}
          <div className="h-8 bg-muted rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

// Skeleton para tabelas de active stages
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
      {/* Header skeleton */}
      <div className="bg-primary/5 px-6 py-4 border-b-2 border-border animate-pulse">
        <div className="h-6 bg-muted rounded w-48 mb-2" />
        <div className="h-4 bg-muted rounded w-32" />
      </div>

      {/* Table skeleton */}
      <div className="p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg animate-pulse"
          >
            {/* Task name */}
            <div className="flex-1">
              <div className="h-5 bg-muted rounded w-3/4 mb-2" />
              <div className="h-4 bg-muted rounded w-1/2" />
            </div>

            {/* Stage badge */}
            <div className="h-8 w-8 bg-muted rounded-full" />

            {/* Priority badge */}
            <div className="h-6 w-20 bg-muted rounded-full" />

            {/* Status badge */}
            <div className="h-6 w-24 bg-muted rounded-full" />

            {/* Due date */}
            <div className="h-4 w-20 bg-muted rounded" />

            {/* Action button */}
            <div className="h-9 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton completo do dashboard
export function DashboardSkeleton() {
  return (
    <div className="container mx-auto py-6 px-4">
      {/* Header skeleton */}
      <div className="mb-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-64 mb-2" />
        <div className="h-4 bg-muted rounded w-96" />
      </div>

      {/* Stats cards skeleton */}
      <StatsCardSkeleton />

      {/* Dashboard widgets skeleton */}
      <div className="space-y-8">
        <TableSkeleton rows={3} />
        <TableSkeleton rows={3} />
      </div>
    </div>
  );
}

// Skeleton para widget individual (usado com Suspense)
export function WidgetSkeleton({ title }: { title?: string }) {
  return (
    <div className="bg-card shadow-lg rounded-xl border-2 border-border overflow-hidden">
      <div className="bg-primary/5 px-6 py-4 border-b-2 border-border">
        {title ? (
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
        ) : (
          <div className="h-6 bg-muted rounded w-48 animate-pulse" />
        )}
      </div>
      <div className="p-6">
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 bg-muted/30 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
