import { describe, expect, it } from "vitest";
import { mapCardToTask, type MapTaskContext } from "@/lib/trello/map-task";
import type { Card, CardMovement } from "@/lib/trello/types";

/** ID da lista "Concluido" do Trello de Atlântico. */
const CONCLUIDO_LIST_ID = "6a7496abe3c32fb0e00ed39b";

/** NOME exato da mesma lista — é por ele que se casa a movimentação de conclusão (CardMovement
 * carrega o nome da lista, não o id). O quadro real tem duas listas parecidas ("Concluido" e
 * "concluido"); o casamento é exato, sensível a maiúsculas, como no resto do módulo. */
const CONCLUIDO_LIST_NAME = "Concluido";

/** A lista de concluído do mês passado: quando o mês vira, `Concluido` é RENOMEADA para o mês e uma
 * nova `Concluido` nasce. No quadro real são duas com card: `Concluido` (agosto e setembro) e
 * `Julio` (33 dos seus 35 cards são de julho). */
const JULHO_LIST_ID = "lista-julio";

/** Helper: cria um card com os valores padrão para teste. */
function card(overrides: Partial<Card> = {}): Card {
  return {
    name: "Card padrão",
    idLabels: [],
    attachments: [],
    idList: "L_OTHER",
    dateClosed: null,
    dateLastActivity: null,
    closed: false,
    desc: "",
    due: null,
    ...overrides,
  };
}

/** Helper: uma movimentação entre listas, como buildImportPlan monta a partir de board.actions. */
function moveu(fromListName: string, toListName: string, at: string): CardMovement {
  return { fromListName, toListName, at };
}

/** Helper: cria um contexto com default de labels e lista Concluido. */
function ctx(overrides: Partial<MapTaskContext> = {}): MapTaskContext {
  return {
    labelsById: {},
    completedListIds: [CONCLUIDO_LIST_ID, JULHO_LIST_ID],
    completedListNames: [CONCLUIDO_LIST_NAME, "Julio"],
    ...overrides,
  };
}

describe("mapCardToTask", () => {
  describe("título — rótulo de tipo vira prefixo", () => {
    it("o rótulo de tipo vira prefixo do título", () => {
      const r = mapCardToTask(
        card({ name: "Carrusel de carnaval", idLabels: ["L1"] }),
        [],
        ctx({ labelsById: { L1: "STORIES" } })
      );
      expect(r.title).toBe("[STORIES] Carrusel de carnaval");
    });

    it("rótulo SOCIAL MEDIA vira prefixo", () => {
      const r = mapCardToTask(
        card({ name: "Post de Instagram", idLabels: ["L2"] }),
        [],
        ctx({ labelsById: { L2: "SOCIAL MEDIA" } })
      );
      expect(r.title).toBe("[SOCIAL MEDIA] Post de Instagram");
    });

    it("rótulo REELS vira prefixo", () => {
      const r = mapCardToTask(
        card({ name: "Reel de TikTok", idLabels: ["L3"] }),
        [],
        ctx({ labelsById: { L3: "REELS" } })
      );
      expect(r.title).toBe("[REELS] Reel de TikTok");
    });

    it("card sem rótulo de tipo não tem prefixo", () => {
      const r = mapCardToTask(
        card({ name: "Carrusel de carnaval", idLabels: ["L4"] }),
        [],
        ctx({ labelsById: { L4: "URGENTE" } })
      );
      expect(r.title).toBe("Carrusel de carnaval");
    });

    it("card sem rótulo não tem prefixo", () => {
      const r = mapCardToTask(card({ name: "Carrusel de carnaval", idLabels: [] }), [], ctx({}));
      expect(r.title).toBe("Carrusel de carnaval");
    });

    it("quando múltiplos rótulos de tipo existem, usa ordem estável (primeiro da lista)", () => {
      const r = mapCardToTask(
        card({ name: "Conteúdo", idLabels: ["L1", "L2"] }),
        [],
        ctx({ labelsById: { L1: "STORIES", L2: "SOCIAL MEDIA" } })
      );
      // Primeiro rótulo de tipo na ordem
      expect(r.title).toBe("[STORIES] Conteúdo");
    });

    it("múltiplos rótulos de tipo invertidos: honra ordem do card, não ordem fixa (prova mutação)", () => {
      const r = mapCardToTask(
        card({ name: "Conteúdo", idLabels: ["L1", "L2"] }),
        [],
        ctx({ labelsById: { L1: "REELS", L2: "STORIES" } })
      );
      // REELS aparece primeiro no card, então deve ser prefixo, não STORIES
      // (se implementação iterasse ordem fixa, pegaria STORIES)
      expect(r.title).toBe("[REELS] Conteúdo");
    });
  });

  describe("prioridade — sai dos rótulos, e só deles", () => {
    it("rótulo URGENTE vira URGENT", () => {
      const r = mapCardToTask(
        card({ idLabels: ["L1"] }),
        [],
        ctx({ labelsById: { L1: "URGENTE" } })
      );
      expect(r.priority).toBe("URGENT");
    });

    it("rótulo PRIORIDAD vira HIGH", () => {
      const r = mapCardToTask(
        card({ idLabels: ["L2"] }),
        [],
        ctx({ labelsById: { L2: "PRIORIDAD" } })
      );
      expect(r.priority).toBe("HIGH");
    });

    it("rótulo IMPORTANTE vira HIGH", () => {
      const r = mapCardToTask(
        card({ idLabels: ["L3"] }),
        [],
        ctx({ labelsById: { L3: "IMPORTANTE" } })
      );
      expect(r.priority).toBe("HIGH");
    });

    it("card sem rótulo de prioridade vira MEDIUM", () => {
      const r = mapCardToTask(card({ idLabels: [] }), [], ctx({}));
      expect(r.priority).toBe("MEDIUM");
    });

    it("card com rótulos mas nenhum de prioridade vira MEDIUM", () => {
      const r = mapCardToTask(
        card({ idLabels: ["L1", "L2"] }),
        [],
        ctx({ labelsById: { L1: "STORIES", L2: "OUTRO" } })
      );
      expect(r.priority).toBe("MEDIUM");
    });

    it("múltiplos rótulos de prioridade: URGENTE > outros", () => {
      const r = mapCardToTask(
        card({ idLabels: ["L1", "L2"] }),
        [],
        ctx({ labelsById: { L1: "IMPORTANTE", L2: "URGENTE" } })
      );
      expect(r.priority).toBe("URGENT");
    });
  });

  describe("status — a lista de concluído, e as renomeadas", () => {
    it("card na lista de concluído do mês PASSADO também é concluído", () => {
      // Quando o mês vira, a lista `Concluido` é renomeada para o mês (`Julio`) e uma nova nasce.
      // O card que ficou na renomeada foi entregue igual — só num mês anterior.
      const r = mapCardToTask(
        card({ idList: JULHO_LIST_ID, dateCompleted: "2026-07-28T10:00:00Z" }),
        [],
        ctx()
      );
      expect(r.status).toBe("COMPLETED");
      expect(r.completedAt).toEqual(new Date("2026-07-28T10:00:00Z"));
    });

    it("a movimentação para a lista renomeada também data a conclusão", () => {
      const r = mapCardToTask(
        card({ idList: JULHO_LIST_ID }),
        [moveu("AUDIOVISUAL", "Julio", "2026-07-30T09:00:00Z")],
        ctx()
      );
      expect(r.completedAt).toEqual(new Date("2026-07-30T09:00:00Z"));
    });

    it("card aberto em Concluido ainda é COMPLETED (se passou por Concluido, está concluído)", () => {
      const r = mapCardToTask(
        card({
          idList: CONCLUIDO_LIST_ID,
          closed: false,
        }),
        [],
        ctx()
      );
      expect(r.status).toBe("COMPLETED");
    });

    it("card aberto fora de Concluido é IN_PROGRESS", () => {
      const r = mapCardToTask(
        card({
          idList: "L_OUTRO",
          closed: false,
        }),
        [],
        ctx()
      );
      expect(r.status).toBe("IN_PROGRESS");
    });
  });

  // A data de conclusão vem do EVENTO datado, na ordem: movimentação para Concluido (41 dos 52
  // cards da lista), `dateCompleted` (38 lá, 4 entre os arquivados) e o arquivamento `dateClosed`
  // (156 dos 157 arquivados). O arquivamento é o mais fraco porque é o ato de GUARDAR, não o de
  // entregar — mas é datado, e no quadro real a mediana da distância entre o prazo e ele é 0 dia.
  describe("completedAt — a evidência datada, nesta ordem", () => {
    it("1º: a movimentação para Concluido manda, mesmo com dateCompleted diferente", () => {
      const r = mapCardToTask(
        card({
          idList: CONCLUIDO_LIST_ID,
          dateCompleted: "2026-07-01T08:00:00Z",
        }),
        [moveu("LIBERADO", "Concluido", "2026-07-02T10:00:00Z")],
        ctx()
      );
      expect(r.completedAt).toEqual(new Date("2026-07-02T10:00:00Z"));
    });

    it("vale a ÚLTIMA movimentação para Concluido, não a primeira", () => {
      const r = mapCardToTask(
        card({ idList: CONCLUIDO_LIST_ID }),
        [
          moveu("LIBERADO", "Concluido", "2026-07-02T10:00:00Z"),
          moveu("Concluido", "REVISIÓN", "2026-07-03T09:00:00Z"),
          moveu("REVISIÓN", "Concluido", "2026-07-05T16:00:00Z"),
        ],
        ctx()
      );
      expect(r.completedAt).toEqual(new Date("2026-07-05T16:00:00Z"));
    });

    it("movimentação para OUTRA lista não conta — só a que entra em Concluido", () => {
      const r = mapCardToTask(
        card({ idList: CONCLUIDO_LIST_ID }),
        [moveu("DISEÑO - MARTIN", "REVISIÓN", "2026-07-02T10:00:00Z")],
        ctx()
      );
      expect(r.completedAt).toBeNull();
    });

    it("2º: sem movimentação para Concluido, cai em dateCompleted", () => {
      const r = mapCardToTask(
        card({
          idList: CONCLUIDO_LIST_ID,
          dateCompleted: "2026-07-01T08:00:00Z",
        }),
        [],
        ctx()
      );
      expect(r.completedAt).toEqual(new Date("2026-07-01T08:00:00Z"));
    });

    it("3º: sem nenhuma das duas, fica NULO — nenhuma data é inventada", () => {
      const r = mapCardToTask(card({ idList: CONCLUIDO_LIST_ID }), [], ctx());
      expect(r.status).toBe("COMPLETED");
      expect(r.completedAt).toBeNull();
    });

    it("card arquivado nem chega a mapCardToTask — mas se chegar, não é concluído", () => {
      // `buildImportPlan` manda o arquivado para `skipped` antes daqui (arquivar é descartar).
      // Esta é a rede: nem `dateCompleted` nem `dateClosed` fazem um card fora das listas de
      // concluído virar entrega.
      const r = mapCardToTask(
        card({
          idList: "L_AV",
          closed: true,
          dateClosed: "2026-07-20T10:00:00Z",
          dateCompleted: "2026-07-18T09:00:00Z",
        }),
        [],
        ctx()
      );
      expect(r.status).toBe("IN_PROGRESS");
      expect(r.completedAt).toBeNull();
    });
  });

  describe("mês do projeto", () => {
    it("usa o prazo (due) quando existe", () => {
      const r = mapCardToTask(
        card({
          due: "2026-07-15T00:00:00Z",
          dateLastActivity: "2026-08-01T00:00:00Z",
        }),
        [],
        ctx()
      );
      expect(r.monthKey).toBe("2026-07");
    });

    it("cai na última atividade quando não há prazo", () => {
      const r = mapCardToTask(
        card({
          due: null,
          dateLastActivity: "2026-09-10T14:30:00Z",
        }),
        [],
        ctx()
      );
      expect(r.monthKey).toBe("2026-09");
    });

    it("sem os dois, devolve null para a repescagem — não inventa mês", () => {
      const r = mapCardToTask(card({ due: null, dateLastActivity: null }), [], ctx());
      expect(r.monthKey).toBeNull();
    });

    it("prefere due mesmo que dateLastActivity seja mais recente", () => {
      const r = mapCardToTask(
        card({
          due: "2026-07-01T00:00:00Z",
          dateLastActivity: "2026-09-10T14:30:00Z",
        }),
        [],
        ctx()
      );
      expect(r.monthKey).toBe("2026-07");
    });

    it("extrai mês correto para diferentes datas", () => {
      const testCases = [
        { due: "2026-01-15T00:00:00Z", expected: "2026-01" },
        { due: "2026-12-31T00:00:00Z", expected: "2026-12" },
        { due: "2025-06-10T00:00:00Z", expected: "2025-06" },
      ];

      for (const tc of testCases) {
        const r = mapCardToTask(card({ due: tc.due }), [], ctx());
        expect(r.monthKey).toBe(tc.expected);
      }
    });
  });

  describe("descrição", () => {
    it("descrição vira description", () => {
      const r = mapCardToTask(card({ desc: "Esta é a descrição do card" }), [], ctx());
      expect(r.description).toBe("Esta é a descrição do card");
    });

    it("descrição vazia vira string vazia", () => {
      const r = mapCardToTask(card({ desc: "" }), [], ctx());
      expect(r.description).toBe("");
    });

    it("descrição null vira string vazia", () => {
      const r = mapCardToTask(card({ desc: undefined }), [], ctx());
      expect(r.description).toBe("");
    });
  });

  describe("dueDate", () => {
    it("due vira dueDate como Date", () => {
      const r = mapCardToTask(card({ due: "2026-07-15T10:00:00Z" }), [], ctx());
      expect(r.dueDate).toEqual(new Date("2026-07-15T10:00:00Z"));
    });

    it("sem due vira dueDate null", () => {
      const r = mapCardToTask(card({ due: null }), [], ctx());
      expect(r.dueDate).toBeNull();
    });
  });
});
