import { describe, it, expect } from "vitest";
import { isAboveOwnPace, PACE_MIN_WEEKS, PACE_HISTORY_WEEKS } from "@/lib/planning/own-pace";

describe("isAboveOwnPace", () => {
  it("acima da mediana do próprio histórico: reconhece", () => {
    // Mediana de [2,3,4,5] = 3.5; sete etapas nesta semana passa disso.
    expect(isAboveOwnPace(7, [2, 3, 4, 5])).toBe(true);
  });

  it("igual à mediana: não reconhece — a mensagem só existe no lado positivo", () => {
    expect(isAboveOwnPace(3, [2, 3, 3, 4])).toBe(false);
  });

  it("abaixo da mediana: não reconhece, e não existe versão inversa", () => {
    expect(isAboveOwnPace(1, [2, 3, 4, 5])).toBe(false);
  });

  it("amostra curta não reconhece: elogio sobre duas semanas é ruído com cara de mérito", () => {
    expect(isAboveOwnPace(99, [1, 1, 1])).toBe(false);
  });

  it("no limiar exato da amostra, reconhece", () => {
    expect(PACE_MIN_WEEKS).toBe(4);
    expect(isAboveOwnPace(9, [1, 1, 1, 1])).toBe(true);
  });

  it("sem histórico nenhum não reconhece", () => {
    expect(isAboveOwnPace(5, [])).toBe(false);
  });

  it("semana zerada nunca reconhece, mesmo com histórico zerado", () => {
    // Guarda contra a mediana 0: sem isto, quem fechou zero seria elogiado por
    // "estar acima" de um histórico de zeros.
    expect(isAboveOwnPace(0, [0, 0, 0, 0])).toBe(false);
  });

  it("a janela do histórico é de 8 semanas", () => {
    expect(PACE_HISTORY_WEEKS).toBe(8);
  });
});
