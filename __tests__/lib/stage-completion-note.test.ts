import { describe, it, expect } from "vitest";
import { needsReason, LOW_LOG_RATIO, STAGE_NOTE_REASONS } from "@/lib/stage-completion-note";

describe("needsReason", () => {
  it("acima da referência pede motivo", () => {
    // O cronômetro esquecido ligado é o caso clássico: a etapa fecha com um número que não
    // descreve trabalho nenhum, e o p50 de todo mundo aprende com ele.
    expect(needsReason(5, 4)).toBe(true);
  });

  it("exatamente na referência NÃO pede", () => {
    // A referência é um p50: metade das execuções fica naturalmente em cima ou perto dela.
    expect(needsReason(4, 4)).toBe(false);
  });

  it("logo abaixo da referência não pede", () => {
    expect(needsReason(3.9, 4)).toBe(false);
  });

  it("10% da referência pede motivo — o limite é inclusivo", () => {
    // Fechar a etapa com quase nada apontado quase sempre quer dizer que o cronômetro não foi
    // usado. É o caso que mais envenena a referência, e o que passaria batido sem este limite.
    expect(needsReason(0.4, 4)).toBe(true);
  });

  it("acima de 10% e abaixo da referência não pede", () => {
    expect(needsReason(0.5, 4)).toBe(false);
  });

  it("zero apontado pede motivo", () => {
    expect(needsReason(0, 4)).toBe(true);
  });

  it("sem referência nunca pede — não há contra o que comparar", () => {
    // Etapa sem amostra e sem SLA cadastrado. Inventar uma régua para justificar seria pior que
    // não perguntar.
    expect(needsReason(0, 0)).toBe(false);
    expect(needsReason(99, 0)).toBe(false);
  });

  it("a razão do limite de baixo é 10%", () => {
    expect(LOW_LOG_RATIO).toBe(0.1);
  });

  it("os cinco motivos existem e a ordem é a da tela", () => {
    expect(STAGE_NOTE_REASONS).toEqual([
      "EXTERNAL_INTERRUPTION",
      "REWORK",
      "SCOPE_LARGER",
      "TIMER_FORGOTTEN",
      "OTHER",
    ]);
  });
});
