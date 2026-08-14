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
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="mt-1.5 h-7 w-56 rounded bg-muted" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-muted" />
      </header>

      <div className="space-y-4">
        {/* Barra única: tags à esquerda, navegação ao centro, ações à direita. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-border bg-card p-3">
          <div />
          <div className="mx-auto h-9 w-56 rounded-lg bg-muted" />
          <div className="ml-auto flex gap-2">
            <div className="h-9 w-24 rounded-lg bg-muted" />
            <div className="h-9 w-24 rounded-lg bg-muted" />
          </div>
        </div>
        <MonthGridSkeleton />
      </div>
    </div>
  );
}
