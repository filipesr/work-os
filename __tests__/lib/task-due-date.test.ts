import { describe, it, expect } from "vitest";
import { resolveDueDate } from "@/lib/task-due-date";

describe("resolveDueDate", () => {
  it("data informada vira Date", () => {
    const r = resolveDueDate("2026-09-15", false);
    expect(r).toEqual({ date: new Date("2026-09-15T00:00:00.000Z") });
  });

  it("sem data e sem a marca é RECUSADO — é o bug que trouxe esta regra", () => {
    // Demanda sem prazo nunca fica atrasada, some da cobertura por cliente e conta como
    // "no prazo" na carga do time. Deixar acontecer por distração é criar trabalho invisível.
    expect(resolveDueDate("", false)).toEqual({ problem: "required" });
  });

  it("com a marca, a demanda nasce sem prazo — de propósito", () => {
    expect(resolveDueDate("", true)).toEqual({ date: null });
  });

  it("a marca vence a data digitada: quem marcou decidiu depois", () => {
    // Sem esta regra, marcar a caixa com uma data já digitada gravaria o prazo assim mesmo —
    // e a pessoa veria o oposto do que pediu.
    expect(resolveDueDate("2026-09-15", true)).toEqual({ date: null });
  });

  it("data em formato errado é recusada, não convertida em silêncio", () => {
    expect(resolveDueDate("15/09/2026", false)).toEqual({ problem: "invalid" });
  });

  it("data impossível é recusada", () => {
    expect(resolveDueDate("2026-02-31", false)).toEqual({ problem: "invalid" });
  });

  it("data no passado é aceita: registrar demanda vencida é legítimo", () => {
    const r = resolveDueDate("2020-01-10", false);
    expect(r).toEqual({ date: new Date("2020-01-10T00:00:00.000Z") });
  });
});
