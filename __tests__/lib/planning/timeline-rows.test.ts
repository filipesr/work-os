import { describe, it, expect } from "vitest";
import { buildTimelineRows, MIN_GAP_DAYS } from "@/lib/planning/timeline-rows";

describe("buildTimelineRows", () => {
  it("vai do mais recente para o mais antigo — futuro em cima, passado embaixo", () => {
    const linhas = buildTimelineRows({
      firstISO: "2026-09-07",
      lastISO: "2026-09-09",
      todayISO: "2026-09-08",
      movedDays: new Set(["2026-09-07", "2026-09-09"]),
    });
    expect(linhas.map((l) => (l.kind === "day" ? l.dayISO : "gap"))).toEqual([
      "2026-09-09",
      "2026-09-08",
      "2026-09-07",
    ]);
  });

  it("hoje é SEMPRE uma linha, mesmo sem movimento nenhum", () => {
    // Hoje é a linha do meio: é ela que separa o que aconteceu do que é projeção. Comprimi-la
    // apagaria a referência que o resto da tela usa para se orientar.
    const linhas = buildTimelineRows({
      firstISO: "2026-09-07",
      lastISO: "2026-09-07",
      todayISO: "2026-09-07",
      movedDays: new Set(),
    });
    expect(linhas).toEqual([{ kind: "day", dayISO: "2026-09-07" }]);
  });

  it("sequência sem movimento vira UMA faixa, com a contagem", () => {
    // O vão é a informação principal da tela: doze dias parados no meio de um projeto é o que
    // hoje ninguém vê, e costuma ser a explicação do atraso.
    const linhas = buildTimelineRows({
      firstISO: "2026-09-01",
      lastISO: "2026-09-10",
      todayISO: "2026-09-10",
      movedDays: new Set(["2026-09-01", "2026-09-10"]),
    });
    expect(linhas).toEqual([
      { kind: "day", dayISO: "2026-09-10" },
      { kind: "gap", fromISO: "2026-09-02", toISO: "2026-09-09", days: 8 },
      { kind: "day", dayISO: "2026-09-01" },
    ]);
  });

  it("um único dia parado NÃO vira faixa", () => {
    // Uma faixa dizendo "1 dia sem movimento" ocupa mais espaço do que a linha que ela substitui,
    // e não conta nada que a ausência da linha já não contasse.
    expect(MIN_GAP_DAYS).toBe(2);
    const linhas = buildTimelineRows({
      firstISO: "2026-09-07",
      lastISO: "2026-09-09",
      todayISO: "2026-09-09",
      movedDays: new Set(["2026-09-07", "2026-09-09"]),
    });
    expect(linhas).toEqual([
      { kind: "day", dayISO: "2026-09-09" },
      { kind: "day", dayISO: "2026-09-08" },
      { kind: "day", dayISO: "2026-09-07" },
    ]);
  });

  it("o vão quebra em hoje: nunca engole a linha do meio", () => {
    const linhas = buildTimelineRows({
      firstISO: "2026-09-01",
      lastISO: "2026-09-10",
      todayISO: "2026-09-05",
      movedDays: new Set(["2026-09-01", "2026-09-10"]),
    });
    expect(linhas).toEqual([
      { kind: "day", dayISO: "2026-09-10" },
      { kind: "gap", fromISO: "2026-09-06", toISO: "2026-09-09", days: 4 },
      { kind: "day", dayISO: "2026-09-05" },
      { kind: "gap", fromISO: "2026-09-02", toISO: "2026-09-04", days: 3 },
      { kind: "day", dayISO: "2026-09-01" },
    ]);
  });

  it("projeto de um único dia devolve uma linha só", () => {
    const linhas = buildTimelineRows({
      firstISO: "2026-09-07",
      lastISO: "2026-09-07",
      todayISO: "2026-09-07",
      movedDays: new Set(["2026-09-07"]),
    });
    expect(linhas).toEqual([{ kind: "day", dayISO: "2026-09-07" }]);
  });

  it("janela invertida não explode nem gera linha", () => {
    // Defesa contra dado incompleto: projeto sem nenhum carimbo de data ainda renderiza a tela.
    expect(
      buildTimelineRows({
        firstISO: "2026-09-10",
        lastISO: "2026-09-01",
        todayISO: "2026-09-05",
        movedDays: new Set(),
      })
    ).toEqual([]);
  });
});
