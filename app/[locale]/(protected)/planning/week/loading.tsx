/**
 * Sem este arquivo, clicar em "Programação da semana" mostrava a tela ANTERIOR, intacta, até o
 * servidor terminar — e com o banco a ~300ms de ida e volta isso são um a dois segundos em que a
 * interface parece ter ignorado o clique. O esqueleto não deixa a tela mais rápida; deixa a espera
 * visível, que é o que faltava.
 *
 * Espelha a estrutura real: cabeçalho com filtros e navegação, mais a grade de pessoas por dia com
 * a primeira coluna fixa e estreita.
 */
export default function WeekPlanningLoading() {
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
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-2">
              <div className="h-14 w-44 shrink-0 rounded bg-muted" />
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
