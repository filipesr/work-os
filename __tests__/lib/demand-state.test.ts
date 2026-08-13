import { describe, expect, it } from "vitest";

import {
  DEMAND_STATE_TONE,
  demandState,
  needsAttention,
  type DemandDates,
} from "@/lib/calendar/demand-state";

const HOJE = new Date("2026-12-01T12:00:00Z");
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** Demanda planejada para começar 20/11 e concluir 08/12 (o exemplo do Natal). */
const base: DemandDates = {
  plannedStartAt: d("2026-11-20"),
  dueDate: d("2026-12-08"),
  startedAt: null,
  completedAt: null,
};

describe("demandState", () => {
  it("concluída dentro do prazo é ENTREGUE", () => {
    // O caso que motivou a tela: concluir antes da data é o desfecho desejado,
    // não uma ausência. Antes disso a demanda pronta sumia da leitura.
    expect(demandState({ ...base, completedAt: d("2026-12-05") }, HOJE)).toBe("delivered");
  });

  it("concluída depois do prazo é ENTREGUE COM ATRASO", () => {
    expect(demandState({ ...base, completedAt: d("2026-12-10") }, HOJE)).toBe("deliveredLate");
  });

  it("conclusão manda sobre tudo — inclusive sobre ter começado tarde", () => {
    // Fato consumado. Se entregou no prazo, o percurso não interessa mais.
    const atrasadaNoMeio = { ...base, startedAt: d("2026-12-01"), completedAt: d("2026-12-07") };
    expect(demandState(atrasadaNoMeio, HOJE)).toBe("delivered");
  });

  it("prazo estourado sem conclusão é ATRASADA, mesmo em execução", () => {
    // A precedência que mais importa: mostrar como "em execução" esconderia o
    // problema atrás do movimento. Estar sendo tocada não desatrasa.
    const depoisDoPrazo = new Date("2026-12-10T12:00:00Z");
    expect(demandState(base, depoisDoPrazo)).toBe("late");
    expect(demandState({ ...base, startedAt: d("2026-12-09") }, depoisDoPrazo)).toBe("late");
  });

  it("começou e está dentro do prazo é EM EXECUÇÃO", () => {
    expect(demandState({ ...base, startedAt: d("2026-11-25") }, HOJE)).toBe("inProgress");
  });

  it("passou do início planejado sem começar é EM RISCO", () => {
    // Hoje 01/12, deveria ter começado 20/11. O atraso ainda não existe — o
    // prazo é 08/12 — mas o tempo que o plano reservou já virou fila.
    expect(demandState(base, HOJE)).toBe("atRisk");
  });

  it("antes do início planejado é PLANEJADA", () => {
    const antes = new Date("2026-11-15T12:00:00Z");
    expect(demandState(base, antes)).toBe("planned");
  });

  it("sem plano de início nunca fica em risco", () => {
    // Demandas criadas antes do conceito, ou fora do fluxo de planejamento, não
    // podem ser acusadas de atraso de início que ninguém definiu.
    expect(demandState({ ...base, plannedStartAt: null }, HOJE)).toBe("planned");
  });

  it("sem prazo nunca fica atrasada", () => {
    const semPrazo = { ...base, dueDate: null, plannedStartAt: null };
    const bemDepois = new Date("2027-06-01T12:00:00Z");
    expect(demandState(semPrazo, bemDepois)).toBe("planned");
    expect(demandState({ ...semPrazo, completedAt: d("2027-01-01") }, bemDepois)).toBe("delivered");
  });
});

describe("tons e atenção", () => {
  it("entregue é positivo", () => {
    // O ponto do pedido: a demanda concluída precisa LER como boa notícia.
    expect(DEMAND_STATE_TONE.delivered).toBe("success");
  });

  it("cada estado tem um tom", () => {
    for (const s of [
      "delivered",
      "deliveredLate",
      "late",
      "atRisk",
      "inProgress",
      "planned",
    ] as const) {
      expect(DEMAND_STATE_TONE[s], s).toBeTruthy();
    }
  });

  it("pedem ação apenas os dois estados acionáveis", () => {
    // "Entregue com atraso" dói, mas já passou — não há o que fazer hoje. Marcar
    // como pendência afogaria os dois que ainda dão para salvar.
    expect(needsAttention("late")).toBe(true);
    expect(needsAttention("atRisk")).toBe(true);
    expect(needsAttention("deliveredLate")).toBe(false);
    expect(needsAttention("delivered")).toBe(false);
    expect(needsAttention("inProgress")).toBe(false);
    expect(needsAttention("planned")).toBe(false);
  });
});
