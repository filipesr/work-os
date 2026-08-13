/**
 * Esqueletos das grades, compartilhados por dois consumidores:
 *
 *  - `loading.tsx`, que o Next mostra ao ENTRAR na rota;
 *  - o `fallback` do Suspense com chave de período, que os mostra ao TROCAR de
 *    semana/mês dentro da mesma rota.
 *
 * O segundo caso não funcionava: mudar `?week=` é navegação suave na mesma rota,
 * então `loading.tsx` não dispara e a tela antiga ficava congelada até o novo
 * conteúdo chegar — sem nenhum sinal de que algo estava acontecendo.
 *
 * Um arquivo só porque dois esqueletos da mesma grade divergem: alguém ajusta o
 * de entrada, esquece o de troca, e a tela pisca em dois formatos diferentes.
 */

export function WeekGridSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-border bg-card">
      {/* Cabeçalho: coluna de faixa + 7 dias, como GRID_COLS da grade real. */}
      <div
        className="grid gap-px bg-border"
        style={{ gridTemplateColumns: "180px repeat(7, minmax(140px, 1fr))" }}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={`h-${i}`} className="bg-muted/60 px-3 py-2">
            <div className="h-3 w-10 rounded bg-muted-foreground/10" />
            <div className="mt-1 h-3 w-12 rounded bg-muted-foreground/10" />
          </div>
        ))}
      </div>
      {/* Três faixas de time, com barras de larguras diferentes. */}
      {Array.from({ length: 3 }).map((_, faixa) => (
        <div
          key={faixa}
          className="grid border-t border-border"
          style={{ gridTemplateColumns: "180px repeat(7, minmax(140px, 1fr))" }}
        >
          <div className="border-r border-border px-4 py-3">
            <div className="h-4 w-24 rounded bg-muted" />
          </div>
          <div className="col-span-7 space-y-1.5 p-2" style={{ gridColumn: "span 7" }}>
            <div className="h-7 rounded bg-muted" style={{ width: `${45 + faixa * 15}%` }} />
            <div
              className="ml-[20%] h-7 rounded bg-muted"
              style={{ width: `${30 + faixa * 10}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MonthGridSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-7 gap-px bg-border">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={`h-${i}`} className="bg-muted/60 px-2 py-2">
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
  );
}
