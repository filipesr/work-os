// Card de ocupação no NAS — lista o breakdown (rótulo + barra + tamanho + nº de arquivos) e o total.
// Presentacional (server). Some quando não há nenhum arquivo READY no escopo (não polui a tela antes
// dos uploads começarem).

import { formatBytes, type StorageStats } from "@/lib/nas/storage-format";

export function StorageBreakdown({ title, stats }: { title: string; stats: StorageStats }) {
  if (stats.totalFiles === 0) return null;
  const max = Math.max(...stats.rows.map((r) => r.bytes), 1);
  return (
    <div className="rounded-lg border-2 border-border p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-foreground">{title}</h3>
        <span className="shrink-0 text-sm font-semibold text-muted-foreground">
          {formatBytes(stats.totalBytes)} · {stats.totalFiles} arq.
        </span>
      </div>
      <ul className="space-y-2">
        {stats.rows.map((r) => (
          <li key={r.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-foreground">{r.label}</span>
              <span className="shrink-0 text-muted-foreground">
                {formatBytes(r.bytes)} · {r.files}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${(r.bytes / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
