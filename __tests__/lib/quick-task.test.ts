import { describe, it, expect } from "vitest";
import {
  QUICK_TASK_MAX_BACKDATE_DAYS,
  validateQuickTaskDate,
  quickTaskTimestamps,
} from "@/lib/quick-task";

// Estas regras decidem o que as métricas vão dizer sobre essa classe de trabalho para sempre.
// Erram em silêncio: nenhum teste de tela pega um lead time carimbado errado.

const AGORA = new Date("2026-08-28T15:00:00.000Z");

describe("validateQuickTaskDate", () => {
  it("aceita hoje", () => {
    expect(validateQuickTaskDate("2026-08-28", AGORA)).toBeNull();
  });

  it("aceita o limite da janela retroativa", () => {
    expect(validateQuickTaskDate("2026-08-21", AGORA)).toBeNull();
  });

  it("recusa antes da janela", () => {
    // Sem limite, um lançamento antigo reescreveria relatório já fechado.
    expect(validateQuickTaskDate("2026-08-20", AGORA)).toBe("tooOld");
  });

  it("recusa data futura — é registro do que JÁ aconteceu", () => {
    expect(validateQuickTaskDate("2026-08-29", AGORA)).toBe("future");
  });

  it("a janela são 7 dias", () => {
    expect(QUICK_TASK_MAX_BACKDATE_DAYS).toBe(7);
  });
});

describe("quickTaskTimestamps", () => {
  it("carimba o fim no instante atual quando a data é hoje", () => {
    // A pessoa acabou de terminar; `agora` é a verdade mais próxima que temos.
    const t = quickTaskTimestamps("2026-08-28", 40, AGORA);
    expect(t.completedAt.toISOString()).toBe(AGORA.toISOString());
  });

  it("deriva o início subtraindo o tempo gasto", () => {
    const t = quickTaskTimestamps("2026-08-28", 40, AGORA);
    expect(t.completedAt.getTime() - t.startedAt.getTime()).toBe(40 * 60 * 1000);
  });

  it("createdAt = startedAt: a demanda nasceu e foi servida no mesmo momento", () => {
    // É isso que zera o queue time desta classe, que é a verdade dela.
    const t = quickTaskTimestamps("2026-08-28", 40, AGORA);
    expect(t.createdAt.toISOString()).toBe(t.startedAt.toISOString());
  });

  it("data passada é carimbada ao meio-dia daquele dia", () => {
    // O horário do dia não é capturado (seria mais um campo, e nenhum relatório usa). Meio-dia é
    // marcador neutro e determinístico, e nunca cai no futuro.
    const t = quickTaskTimestamps("2026-08-25", 60, AGORA);
    expect(t.completedAt.toISOString()).toBe("2026-08-25T15:00:00.000Z"); // 12:00 em São Paulo (UTC-3)
    expect(t.startedAt.toISOString()).toBe("2026-08-25T14:00:00.000Z");
  });
});
