/**
 * Esqueleto do mês: grade de 7 colunas por 6 semanas, com a faixa dos dias da
 * semana. Não existia enquanto as visões dividiam uma rota — `loading.tsx` não
 * enxerga `searchParams`, então quem abria o mês recebia a grade da semana.
 * É o ganho mais direto da separação.
 */
export default function MonthCalendarLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="mt-1.5 h-7 w-72 rounded bg-muted" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-muted" />
      </header>

      <div className="space-y-4">
        {/* Barra de controle: alternador, navegação de período, filtros. */}
        <div className="h-14 rounded-xl border border-border bg-card" />

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-7 gap-px bg-border">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={`h-${i}`} className="bg-muted px-2 py-2">
                <div className="h-3 w-8 rounded bg-muted-foreground/10" />
              </div>
            ))}
            {/* 6 semanas × 7 dias: a grade do mês sempre completa as bordas. */}
            {Array.from({ length: 42 }).map((_, i) => (
              <div key={i} className="min-h-24 bg-card p-2">
                <div className="h-3 w-4 rounded bg-muted" />
                {i % 5 === 0 && <div className="mt-2 h-4 w-full rounded bg-muted" />}
                {i % 3 === 0 && <div className="mt-1 h-3 w-2/3 rounded bg-muted" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
