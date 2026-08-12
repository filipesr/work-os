import { describe, it, expect } from "vitest";
import { utilizationMeter } from "@/lib/team-health-format";
import {
  UTILIZATION_BAND,
  UTILIZATION_BAND_MIN,
  UTILIZATION_BAND_MAX,
  UTILIZATION_SCALE_MAX,
} from "@/lib/reporting-constants";

describe("utilizationMeter", () => {
  it("posiciona o marcador proporcionalmente à régua", () => {
    // 60% numa régua que vai até 120% → metade da barra.
    expect(utilizationMeter(0.6, UTILIZATION_BAND).markerPct).toBeCloseTo(50, 5);
    expect(utilizationMeter(1.2, UTILIZATION_BAND).markerPct).toBeCloseTo(100, 5);
    expect(utilizationMeter(0, UTILIZATION_BAND).markerPct).toBe(0);
  });

  it("desenha a faixa de referência como região, não como limiar", () => {
    const m = utilizationMeter(0.75, UTILIZATION_BAND);
    expect(m.bandStartPct).toBeCloseTo((UTILIZATION_BAND_MIN / UTILIZATION_SCALE_MAX) * 100, 5);
    expect(m.bandStartPct + m.bandWidthPct).toBeCloseTo(
      (UTILIZATION_BAND_MAX / UTILIZATION_SCALE_MAX) * 100,
      5
    );
    expect(m.bandWidthPct).toBeGreaterThan(0);
  });

  it("classifica a posição relativa à faixa (rótulo, não alarme)", () => {
    expect(utilizationMeter(0.4, UTILIZATION_BAND).position).toBe("below");
    expect(utilizationMeter(0.75, UTILIZATION_BAND).position).toBe("inside");
    expect(utilizationMeter(1.1, UTILIZATION_BAND).position).toBe("above");
  });

  it("trata as bordas da faixa como DENTRO (inclusivas)", () => {
    // Uma faixa aproximada não deve ter um degrau exatamente na borda: quem
    // caiu em 60,0% não está "abaixo" de nada em termos acionáveis.
    expect(utilizationMeter(UTILIZATION_BAND_MIN, UTILIZATION_BAND).position).toBe("inside");
    expect(utilizationMeter(UTILIZATION_BAND_MAX, UTILIZATION_BAND).position).toBe("inside");
  });

  it("clampa quem estoura a régua em vez de transbordar a barra", () => {
    // 300% de utilização não pode empurrar o marcador para fora do container —
    // o número exato continua ao lado, então nada de informação se perde.
    const m = utilizationMeter(3, UTILIZATION_BAND);
    expect(m.markerPct).toBe(100);
    expect(m.position).toBe("above");
  });

  it("clampa valores negativos em 0 (dado inválido não vira barra invertida)", () => {
    expect(utilizationMeter(-0.5, UTILIZATION_BAND).markerPct).toBe(0);
  });

  it("aceita uma faixa customizada sem depender das constantes globais", () => {
    const m = utilizationMeter(0.5, { min: 0.4, max: 0.6, scaleMax: 1 });
    expect(m.markerPct).toBeCloseTo(50, 5);
    expect(m.bandStartPct).toBeCloseTo(40, 5);
    expect(m.bandWidthPct).toBeCloseTo(20, 5);
    expect(m.position).toBe("inside");
  });

  it("scaleMax inválido não gera divisão por zero", () => {
    const m = utilizationMeter(0.5, { min: 0.4, max: 0.6, scaleMax: 0 });
    expect(Number.isFinite(m.markerPct)).toBe(true);
  });
});
