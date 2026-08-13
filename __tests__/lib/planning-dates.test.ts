import { describe, expect, it } from "vitest";

import { daysBetweenIso, subtractDays, suggestedStartIso } from "@/lib/calendar/planning-dates";

describe("subtractDays", () => {
  it("faz a conta do exemplo do Natal", () => {
    // 25/12 menos 2 semanas de veiculação = material pronto em 11/12.
    expect(subtractDays("2026-12-25", 14)).toBe("2026-12-11");
  });

  it("atravessa a virada de mês e de ano", () => {
    // O erro clássico desta conta. Feita em Date local em vez de UTC, um destes
    // volta um dia errado dependendo do fuso de quem roda.
    expect(subtractDays("2026-03-01", 1)).toBe("2026-02-28");
    expect(subtractDays("2027-01-05", 10)).toBe("2026-12-26");
    expect(subtractDays("2028-03-01", 1)).toBe("2028-02-29"); // bissexto
  });

  it("aceita o valor de um input de número, que é string", () => {
    expect(subtractDays("2026-12-25", "14")).toBe("2026-12-11");
    expect(subtractDays("2026-12-25", "0")).toBe("2026-12-25");
  });

  it("devolve vazio enquanto não dá para calcular", () => {
    // O estado do formulário antes de o gestor informar a antecedência. Vazio é
    // "ainda não sei", e o caller desabilita o envio — bem diferente de zero,
    // que significa "pronto no próprio dia".
    expect(subtractDays("2026-12-25", "")).toBe("");
    expect(subtractDays("2026-12-25", "  ")).toBe("");
    expect(subtractDays("", 14)).toBe("");
    expect(subtractDays("25/12/2026", 14)).toBe("");
    expect(subtractDays("2026-12-25", "abc")).toBe("");
  });

  it("recusa antecedência negativa", () => {
    // Seria concluir DEPOIS do uso — o oposto do conceito da tela.
    expect(subtractDays("2026-12-25", -3)).toBe("");
  });
});

describe("daysBetweenIso", () => {
  it("mede a antecedência efetiva de uma demanda já criada", () => {
    expect(daysBetweenIso("2026-12-11", "2026-12-25")).toBe(14);
  });

  it("é negativo quando o prazo passou da data de uso", () => {
    expect(daysBetweenIso("2026-12-26", "2026-12-25")).toBe(-1);
  });

  it("null em entrada inválida", () => {
    expect(daysBetweenIso("", "2026-12-25")).toBeNull();
  });
});

describe("suggestedStartIso", () => {
  it("recua o prazo pela duração do fluxo", () => {
    // 3 semanas de desenvolvimento = 504h; prazo 11/12 → começar em 20/11.
    expect(suggestedStartIso("2026-12-11", 504)).toBe("2026-11-20");
  });

  it("arredonda horas para cima, em dias corridos", () => {
    // 25h não cabem em um dia; a sugestão precisa dar dois.
    expect(suggestedStartIso("2026-12-11", 25)).toBe("2026-12-09");
    expect(suggestedStartIso("2026-12-11", 24)).toBe("2026-12-10");
  });

  it("cala quando o fluxo não tem duração configurada", () => {
    // As 14 etapas do sistema estão hoje sem `expectedDurationHours`. Sem esta
    // guarda, todo fluxo não configurado sugeriria "comece hoje" — uma resposta
    // errada com cara de resposta, pior do que não responder.
    expect(suggestedStartIso("2026-12-11", null)).toBe("");
    expect(suggestedStartIso("2026-12-11", 0)).toBe("");
  });
});
