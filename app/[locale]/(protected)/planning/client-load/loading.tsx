/**
 * Mesmo motivo do esqueleto da mesa do gestor: sem ele, a tela anterior fica na frente enquanto o
 * servidor trabalha, e o clique parece não ter pegado.
 *
 * Espelha a grade de clientes por dia da semana.
 */
export default function ClientLoadLoading() {
  return (
    <div className="mx-auto max-w-[110rem] animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="h-4 w-28 rounded bg-muted" />
            <div className="mt-1.5 h-7 w-64 rounded bg-muted" />
            <div className="mt-2 h-4 w-96 max-w-full rounded bg-muted" />
          </div>
          {/* Filtros + navegação de semana. */}
          <div className="flex items-center gap-2">
            <div className="h-9 w-24 rounded-lg bg-muted" />
            <div className="h-9 w-56 rounded-lg bg-muted" />
          </div>
        </div>
      </header>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 h-4 w-72 max-w-full rounded bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <div className="h-14 w-40 shrink-0 rounded bg-muted" />
              {Array.from({ length: 6 }).map((__, j) => (
                <div key={j} className="h-14 flex-1 rounded bg-muted/60" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
