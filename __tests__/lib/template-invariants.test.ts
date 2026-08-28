import { describe, it, expect } from "vitest";
import { canEnableQuickEntry, canAddStage, canDeleteStage } from "@/lib/template-invariants";

// A trava é recíproca: a marca "rápido" e a quantidade de etapas restringem uma à outra. Estes
// predicados são a ÚNICA definição da regra — tela e servidor os consomem, para não existirem duas
// versões da mesma verdade que divergem na primeira mudança.

describe("canEnableQuickEntry", () => {
  it("permite marcar quando há exatamente uma etapa", () => {
    expect(canEnableQuickEntry(1)).toBe(true);
  });

  it("recusa com duas ou mais — um fluxo rápido é de etapa única", () => {
    expect(canEnableQuickEntry(2)).toBe(false);
    expect(canEnableQuickEntry(7)).toBe(false);
  });

  it("recusa com zero — template sem etapa não deve existir", () => {
    expect(canEnableQuickEntry(0)).toBe(false);
  });
});

describe("canAddStage", () => {
  it("um fluxo NORMAL sempre aceita mais uma etapa", () => {
    expect(canAddStage({ stageCount: 1, quickEntry: false })).toBe(true);
    expect(canAddStage({ stageCount: 5, quickEntry: false })).toBe(true);
  });

  it("um fluxo RÁPIDO com sua etapa já não aceita outra", () => {
    expect(canAddStage({ stageCount: 1, quickEntry: true })).toBe(false);
  });

  it("um fluxo rápido sem etapa alguma aceita a primeira", () => {
    // Estado transitório: a marca existe, a etapa ainda não. Bloquear aqui deixaria o template
    // preso em zero etapas, que é o estado que não deve existir.
    expect(canAddStage({ stageCount: 0, quickEntry: true })).toBe(true);
  });
});

describe("canDeleteStage", () => {
  it("recusa apagar a última — template sem etapa não deve existir", () => {
    // Hoje isso é possível, e a falha só aparece muito depois: quem tenta criar uma demanda com o
    // template recebe "Template is misconfigured", longe de quem apagou.
    expect(canDeleteStage(1)).toBe(false);
  });

  it("permite quando sobra etapa", () => {
    expect(canDeleteStage(2)).toBe(true);
  });
});
