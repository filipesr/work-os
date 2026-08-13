/**
 * Sem este arquivo a tela herdava o esqueleto genérico de `(protected)`, que
 * desenha quatro cards de estatística — justamente o bloco que saiu desta tela
 * porque a informação já era visível em cada card de semana. O esqueleto ficou
 * prometendo um layout que não existe mais.
 *
 * Espelha a estrutura real: cabeçalho com o seletor de janela + grade de duas
 * colunas de semanas. A contagem de blocos acompanha a janela padrão.
 */
export default function CoverageLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="h-4 w-28 rounded bg-muted" />
            <div className="mt-1.5 h-7 w-64 rounded bg-muted" />
            <div className="mt-2 h-4 w-96 max-w-full rounded bg-muted" />
          </div>
          {/* Seletor de 8/12 semanas. */}
          <div className="h-9 w-36 rounded-lg bg-muted" />
        </div>
      </header>

      <div className="space-y-6">
        <div>
          <div className="mb-1 h-5 w-52 rounded bg-muted" />
          <div className="mb-4 h-4 w-80 max-w-full rounded bg-muted" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="h-5 w-40 rounded bg-muted" />
                  <div className="h-8 w-20 rounded-lg bg-muted" />
                </div>
                {/* Tags de demanda e de cliente ocioso. */}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <div key={j} className="h-6 w-24 rounded-full bg-muted" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
