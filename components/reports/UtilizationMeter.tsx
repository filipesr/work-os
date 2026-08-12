import { utilizationMeter } from "@/lib/team-health-format";
import { UTILIZATION_BAND } from "@/lib/reporting-constants";

/**
 * Utilização de uma pessoa como FAIXA indicativa (P7/P1), não como nota.
 *
 * A régua vai de 0 a `UTILIZATION_SCALE_MAX`, com a faixa de referência
 * sombreada ao fundo e um marcador na posição da pessoa. Tudo numa cor neutra
 * única: a informação está em ONDE o marcador cai em relação à faixa, e estar
 * fora dela não é "ruim" — é assunto de 1:1 (capacidade/roteamento). Uma escala
 * verde→vermelha diria "esta pessoa está mal", que é a leitura que P1 proíbe.
 *
 * `utilization` null = sem meta de capacidade ou sem período → não desenha
 * régua nenhuma. Ausência de denominador é indefinido, não zero.
 *
 * Server component: sem estado, sem interação.
 */
export function UtilizationMeter({
  utilization,
  bandLabel,
  emptyLabel,
}: {
  utilization: number | null;
  /** Rótulo acessível já resolvido pelo caller (i18n fica na página). */
  bandLabel: string;
  emptyLabel: string;
}) {
  if (utilization == null) {
    return <span className="text-sm text-muted-foreground">{emptyLabel}</span>;
  }

  const meter = utilizationMeter(utilization, UTILIZATION_BAND);
  const pct = Math.round(utilization * 100);

  return (
    <div className="flex items-center gap-2" title={bandLabel}>
      <div
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={bandLabel}
      >
        {/* Faixa de referência: região, não limiar. Fica ATRÁS do marcador. */}
        <span
          className="absolute top-0 h-full bg-foreground/10"
          style={{ left: `${meter.bandStartPct}%`, width: `${meter.bandWidthPct}%` }}
        />
        {/* Marcador da pessoa — cor neutra de acento, idêntica para todos. */}
        <span
          className="absolute top-0 h-full w-1 -translate-x-1/2 rounded-full bg-primary"
          style={{ left: `${meter.markerPct}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums text-foreground">
        {pct}%
      </span>
    </div>
  );
}
