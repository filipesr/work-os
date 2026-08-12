import { describe, it, expect } from "vitest";
import { planningHorizon } from "@/lib/calendar/horizon";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("planningHorizon", () => {
  it("começa HOJE e termina no fim do ano que vem", () => {
    const { start, end } = planningHorizon(day("2026-08-12"));
    expect(start.toISOString()).toBe("2026-08-12T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-12-31T00:00:00.000Z");
  });

  it("hoje está DENTRO da janela (limite inclusivo)", () => {
    const today = day("2026-08-12");
    const { start } = planningHorizon(today);
    expect(today >= start).toBe(true);
  });

  it("data passada fica FORA — é o bug que isto existe para impedir", () => {
    // Um aniversário de 1981 foi aceito no cadastro, a linha nasceu no banco e
    // sumiu da tela: criada de verdade, invisível para sempre, sem nem como
    // excluir pela interface. A janela da criação e a da listagem precisam ser
    // a mesma função.
    const { start } = planningHorizon(day("2026-08-12"));
    expect(day("1981-08-26") < start).toBe(true);
    expect(day("2026-08-11") < start).toBe(true);
  });

  it("data além do ano que vem fica fora", () => {
    const { end } = planningHorizon(day("2026-08-12"));
    expect(day("2028-01-01") > end).toBe(true);
  });

  it("a virada de ano estica a janela junto", () => {
    const { end } = planningHorizon(day("2027-01-01"));
    expect(end.toISOString()).toBe("2028-12-31T00:00:00.000Z");
  });

  it("o intervalo cobre pelo menos um ano inteiro de planejamento", () => {
    // Em 31/12 a janela ainda precisa ter o ano seguinte inteiro pela frente —
    // senão em dezembro não daria para planejar nada.
    const { start, end } = planningHorizon(day("2026-12-31"));
    const dias = (end.getTime() - start.getTime()) / 8.64e7;
    expect(dias).toBeGreaterThanOrEqual(365);
  });
});
