import { describe, it, expect } from "vitest";
import { occupiedRange } from "@/lib/planning/stage-window";

const AS_14H = new Date("2026-09-04T17:00:00.000Z"); // 14h em São Paulo

describe("occupiedRange", () => {
  it("sem hora marcada, não ocupa nada", () => {
    // Item da fila normal: quem manda nele é a ordem manual, não o relógio.
    expect(
      occupiedRange({ scheduledStart: null, scheduledEnd: null, referenceHours: 3 })
    ).toBeNull();
  });

  it("com fim declarado, o compromisso manda", () => {
    // A locação vai das 14h às 16h. A referência da etapa (3h) não tem voto: o que foi combinado
    // com o estúdio é o que ocupa a agenda.
    const r = occupiedRange({
      scheduledStart: AS_14H,
      scheduledEnd: new Date("2026-09-04T19:00:00.000Z"),
      referenceHours: 3,
    });
    expect(r).toEqual({ start: AS_14H, end: new Date("2026-09-04T19:00:00.000Z") });
  });

  it("sem fim declarado, a faixa é o range estimado da etapa", () => {
    const r = occupiedRange({ scheduledStart: AS_14H, scheduledEnd: null, referenceHours: 3 });
    expect(r?.end).toEqual(new Date("2026-09-04T20:00:00.000Z")); // 14h + 3h
  });

  it("etapa sem referência nenhuma ocupa 1h por convenção", () => {
    // Faixa de duração zero não colidiria com nada e a trava inteira viraria decorativa.
    const r = occupiedRange({ scheduledStart: AS_14H, scheduledEnd: null, referenceHours: 0 });
    expect(r?.end).toEqual(new Date("2026-09-04T18:00:00.000Z")); // 14h + 1h
  });
});
