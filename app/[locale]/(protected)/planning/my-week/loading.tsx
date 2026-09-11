/**
 * A tela pessoal também não tinha esqueleto. É uma lista, não uma grade — o desenho acompanha isso,
 * porque um esqueleto que promete outro layout é pior que nenhum: a tela "muda de forma" quando o
 * conteúdo chega.
 */
export default function MyWeekLoading() {
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
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="h-5 w-2/3 max-w-md rounded bg-muted" />
            <div className="mt-2 h-4 w-40 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
