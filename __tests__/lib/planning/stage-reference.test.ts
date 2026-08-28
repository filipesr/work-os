import { describe, it, expect } from "vitest";
import { MIN_REFERENCE_SAMPLES, resolveStageReference } from "@/lib/planning/stage-reference";

// A referência é o número que a pessoa usa para se organizar e que o gestor usa para ver espaço
// livre. De onde ele vem muda o que a tela promete: observado é o que ACONTECE; declarado é o que
// alguém achou quando cadastrou a etapa. A tela precisa saber qual dos dois está mostrando.

describe("resolveStageReference", () => {
  it("usa o p50 observado quando há amostra suficiente", () => {
    const durations = [1, 2, 3, 4, 5];
    const r = resolveStageReference(durations, 10);
    expect(r).toEqual({ hours: 3, source: "observed" });
  });

  it("cai no declarado quando a amostra é pequena", () => {
    // Percentil de duas observações não é referência, é anedota.
    const r = resolveStageReference([1, 9], 4);
    expect(r).toEqual({ hours: 4, source: "declared" });
  });

  it("cai no declarado quando não há observação nenhuma", () => {
    expect(resolveStageReference([], 2)).toEqual({ hours: 2, source: "declared" });
  });

  it("percentil, não média — a distribuição é enviesada (P3)", () => {
    // Uma etapa que quase sempre leva 1h e uma vez levou 40h: a média diria ~7h e encheria a
    // agenda de todo mundo; a mediana diz 1h, que é o que costuma acontecer.
    const r = resolveStageReference([1, 1, 1, 1, 40], 3);
    expect(r.hours).toBe(1);
    expect(r.source).toBe("observed");
  });

  it("sem observação e sem declarado devolve zero declarado, não quebra", () => {
    // Etapa sem SLA não deveria existir (o cadastro exige), mas dado antigo pode não ter.
    expect(resolveStageReference([], null)).toEqual({ hours: 0, source: "declared" });
  });

  it("o mínimo de amostra é 5", () => {
    expect(MIN_REFERENCE_SAMPLES).toBe(5);
  });
});
