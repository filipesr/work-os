/**
 * Sem este arquivo a tela herdava o esqueleto genérico de `(protected)`, que
 * desenha quatro cards de estatística — layout que esta tela não tem. O esqueleto
 * é uma promessa sobre o que vai aparecer; errada, ele custa em vez de ajudar:
 * a pessoa vê quatro cards por ~90ms e eles somem para dar lugar a uma tabela.
 *
 * Espelha a estrutura real: cabeçalho + card do catálogo + tabela de cinco colunas.
 */
export default function DatesLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="mt-1.5 h-7 w-56 rounded bg-muted" />
            <div className="mt-2 h-4 w-80 rounded bg-muted" />
          </div>
          {/* Botão de criar ocorrência, à direita. */}
          <div className="h-9 w-32 rounded-lg bg-muted" />
        </div>
      </header>

      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="mt-2 h-4 w-72 rounded bg-muted" />
          <div className="mt-4 flex gap-2">
            <div className="h-9 w-24 rounded-lg bg-muted" />
            <div className="h-9 w-24 rounded-lg bg-muted" />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="p-6">
            <div className="h-5 w-48 rounded bg-muted" />
            <div className="mt-2 h-4 w-64 rounded bg-muted" />
          </div>
          <div className="flex gap-8 bg-muted px-6 py-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-4 w-20 rounded bg-muted-foreground/10" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-8 border-t border-border px-6 py-4">
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="h-6 w-24 rounded-full bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
              <div className="ml-auto h-8 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
