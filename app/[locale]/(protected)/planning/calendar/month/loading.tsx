import { MonthGridSkeleton } from "../skeletons";

/**
 * Esqueleto de ENTRADA na rota. A grade vem do mesmo componente usado pelo
 * fallback do Suspense de período — um só, senão os dois divergem e a tela
 * pisca em formatos diferentes conforme o caminho de chegada.
 */
export default function MonthCalendarLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="mt-1.5 h-7 w-56 rounded bg-muted" />
            <div className="mt-2 h-4 w-96 max-w-full rounded bg-muted" />
          </div>
          {/* Navegação de período + trava, agora no cabeçalho. */}
          <div className="flex gap-2">
            <div className="h-9 w-32 rounded-lg bg-muted" />
            <div className="h-9 w-28 rounded-lg bg-muted" />
          </div>
        </div>
      </header>

      <div className="space-y-4">
        <div className="h-14 rounded-xl border border-border bg-card" />
        <MonthGridSkeleton />
      </div>
    </div>
  );
}
