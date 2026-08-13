/**
 * Esqueleto da visão semanal. Com as visões em rotas separadas ele finalmente
 * pode ser exato: enquanto era uma tela só, `loading.tsx` não enxergava
 * `searchParams` e quem abria no mês via a grade da semana por um instante.
 */
export default function CalendarLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="mt-1.5 h-7 w-52 rounded bg-muted" />
            <div className="mt-2 h-4 w-80 max-w-full rounded bg-muted" />
          </div>
          {/* Alternador de visão + navegador de período. */}
          <div className="flex gap-2">
            <div className="h-9 w-32 rounded-lg bg-muted" />
            <div className="h-9 w-40 rounded-lg bg-muted" />
          </div>
        </div>
      </header>

      {/* Barra de filtros. */}
      <div className="mb-4 h-12 rounded-lg bg-muted" />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid gap-2 p-4" style={{ gridTemplateColumns: "180px repeat(7, 1fr)" }}>
          {Array.from({ length: 24 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
