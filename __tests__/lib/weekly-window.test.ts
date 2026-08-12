import { describe, it, expect } from "vitest";
import {
  weekSlots,
  windowRange,
  weekIndexOf,
  parseWeekWindow,
  DEFAULT_WEEK_WINDOW,
} from "@/lib/calendar/weekly-window";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// 2026-08-12 é uma quarta-feira; a segunda daquela semana é 2026-08-10.
const QUARTA = day("2026-08-12");

describe("weekSlots — ancoragem na segunda", () => {
  it("a primeira semana começa na SEGUNDA da semana corrente, não em 'hoje'", () => {
    const slots = weekSlots(12, QUARTA);
    expect(slots[0].key).toBe("2026-08-10");
    expect(slots[0].end.toISOString().slice(0, 10)).toBe("2026-08-16");
  });

  it("o recorte é IDÊNTICO de segunda a domingo da mesma semana", () => {
    // É a razão de existir da âncora: quem abre na quarta precisa ver o mesmo
    // que quem abriu na segunda, senão a lista muda debaixo do pé.
    const dias = ["2026-08-10", "2026-08-12", "2026-08-16"].map((d) =>
      weekSlots(12, day(d)).map((s) => s.key)
    );
    expect(dias[0]).toEqual(dias[1]);
    expect(dias[1]).toEqual(dias[2]);
  });

  it("vira o recorte na segunda seguinte", () => {
    expect(weekSlots(12, day("2026-08-17"))[0].key).toBe("2026-08-17");
  });

  it("gera exatamente a quantidade pedida, em sequência semanal", () => {
    const slots = weekSlots(8, QUARTA);
    expect(slots).toHaveLength(8);
    expect(slots[7].key).toBe("2026-09-28");
  });
});

describe("windowRange", () => {
  it("cobre até o FIM do último domingo", () => {
    // Sem isso, uma demanda vencendo no domingo da última semana ficaria fora
    // da janela e o cliente apareceria ocioso sem estar.
    const slots = weekSlots(8, QUARTA);
    const { start, end } = windowRange(slots);
    expect(start.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-04T23:59:59.999Z");
  });
});

describe("weekIndexOf", () => {
  const slots = weekSlots(12, QUARTA);

  it("acha a semana de uma data dentro da janela", () => {
    expect(weekIndexOf(slots, day("2026-08-10"))).toBe(0); // segunda
    expect(weekIndexOf(slots, day("2026-08-16"))).toBe(0); // domingo da mesma
    expect(weekIndexOf(slots, day("2026-08-17"))).toBe(1); // segunda seguinte
  });

  it("devolve -1 para data fora da janela", () => {
    expect(weekIndexOf(slots, day("2026-08-09"))).toBe(-1); // domingo anterior
    expect(weekIndexOf(slots, day("2027-01-01"))).toBe(-1);
  });
});

describe("parseWeekWindow", () => {
  it("aceita só 8 e 12", () => {
    expect(parseWeekWindow("8")).toBe(8);
    expect(parseWeekWindow("12")).toBe(12);
  });

  it("qualquer outra coisa cai no padrão", () => {
    for (const v of ["4", "52", "abc", "", undefined, ["7"]]) {
      expect(parseWeekWindow(v as string | string[] | undefined)).toBe(DEFAULT_WEEK_WINDOW);
    }
  });
});
