import { describe, it, expect } from "vitest";
import {
  workingHoursBetween,
  workingClockEquivalent,
  HOURS_PER_WORKING_DAY,
} from "@/lib/planning/working-hours";
import { stageAgingRatio } from "@/lib/team-health-format";

// A referência de uma etapa é hora de TRABALHO (p50 de TimeLog.hoursSpent, tipicamente 1–8h).
// Medir o decorrido em hora de RELÓGIO contra ela é a mesma mistura de unidades que estragava a
// referência: uma etapa de 2h ativa desde ontem imprimiria "24h nesta etapa · referência 2h", o
// aviso acenderia em quase toda célula, e um sinal que acende sempre não é sinal.
//
// Datas em UTC-3 nos testes (o horário de São Paulo, que é o calendário do app).

const sp = (iso: string) => new Date(`${iso}-03:00`);

describe("workingHoursBetween", () => {
  it("um dia útil inteiro vale a jornada, não 24h", () => {
    expect(workingHoursBetween(sp("2026-08-31T00:00:00"), sp("2026-09-01T00:00:00"))).toBeCloseTo(
      HOURS_PER_WORKING_DAY,
      5
    );
  });

  it("meio dia útil vale meia jornada", () => {
    expect(workingHoursBetween(sp("2026-08-31T00:00:00"), sp("2026-08-31T12:00:00"))).toBeCloseTo(
      4,
      5
    );
  });

  it("o fim de semana não conta nada", () => {
    // Sábado 05/09 e domingo 06/09 inteiros.
    expect(workingHoursBetween(sp("2026-09-05T00:00:00"), sp("2026-09-07T00:00:00"))).toBe(0);
  });

  it("sexta 16h até segunda 10h: 6h úteis, não 66h de relógio", () => {
    // O caso que estragava a referência e agora estragaria o aviso: 2/3 da sexta + 5/12 da
    // segunda = 2h + 3.33h.
    const r = workingHoursBetween(sp("2026-09-04T16:00:00"), sp("2026-09-07T10:00:00"));
    expect(r).toBeCloseTo(8 / 3 + 10 / 3, 5);
    expect(r).toBeLessThan(7);
  });

  it("uma semana de calendário vale cinco jornadas", () => {
    expect(workingHoursBetween(sp("2026-08-31T00:00:00"), sp("2026-09-07T00:00:00"))).toBeCloseTo(
      5 * HOURS_PER_WORKING_DAY,
      5
    );
  });

  it("intervalo invertido ou nulo é zero, não número negativo", () => {
    expect(workingHoursBetween(sp("2026-09-01T10:00:00"), sp("2026-09-01T10:00:00"))).toBe(0);
    expect(workingHoursBetween(sp("2026-09-02T10:00:00"), sp("2026-09-01T10:00:00"))).toBe(0);
  });
});

describe("workingClockEquivalent", () => {
  it("alimenta stageAgingRatio com hora útil sem duplicar a regra de envelhecimento", () => {
    // Sexta 16h → segunda 10h são ~6h úteis. Contra uma referência de 2h, a etapa passou (3x);
    // contra uma de 8h, não passou — e no relógio (66h) as duas teriam "passado".
    const agora = sp("2026-09-07T10:00:00").getTime();
    const equivalente = workingClockEquivalent(sp("2026-09-04T16:00:00"), agora);
    expect(stageAgingRatio(equivalente, 2, agora)).toBeCloseTo(3, 1);
    expect(stageAgingRatio(equivalente, 8, agora)).toBeLessThan(1);
  });
});
