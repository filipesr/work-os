/**
 * A lista de projetos consulta cliente e tarefas de cada projeto; sem esqueleto, a espera acontecia
 * sobre a tela anterior. O desenho acompanha a grade de cartões — três colunas no monitor grande.
 */
export default function ProjectsLoading() {
  return (
    <div className="mx-auto max-w-[110rem] animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="h-4 w-28 rounded bg-muted" />
        <div className="mt-1.5 h-7 w-56 rounded bg-muted" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-muted" />
      </header>
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="h-10 w-48 rounded-lg bg-muted" />
        <div className="h-10 w-64 rounded-lg bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-lg bg-muted" />
              <div className="min-w-0 flex-1">
                <div className="h-5 w-3/4 rounded bg-muted" />
                <div className="mt-1.5 h-4 w-1/2 rounded bg-muted/60" />
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <div className="h-6 w-20 rounded-full bg-muted" />
              <div className="h-6 w-24 rounded-full bg-muted" />
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
