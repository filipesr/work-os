import { describe, expect, it } from "vitest";
import { planStages, type MapStagesContext } from "@/lib/trello/map-stages";
import type { Card, CardMovement } from "@/lib/trello/types";

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

/** Helper: cria uma movimentação entre listas (o par da ação "updateCard" do Trello). */
function mov(fromListName: string, toListName: string, at: string): CardMovement {
  return { fromListName, toListName, at };
}

/** Helper: cria um anexo com autor e data. */
function anexo(
  overrides: Partial<NonNullable<Card["attachments"]>[number]> = {}
): NonNullable<Card["attachments"]>[number] {
  return {
    id: "a1",
    ...overrides,
  };
}

/** Helper: cria um contexto com os nomes de lista e o mapa de designer→Trello ID usados nos testes. */
function ctx(overrides: Partial<MapStagesContext> = {}): MapStagesContext {
  return {
    listNamesById: {
      L_CONC: "Concluido",
      L_MARTIN: "DISEÑO - MARTIN",
      L_AV: "AUDIOVISUAL",
      L_REVISION: "REVISIÓN",
      L_LIBERADO: "LIBERADO",
    },
    trelloIdByDesignerName: { MARTIN: "tMartin" },
    ...overrides,
  };
}

describe("planStages", () => {
  it("nível 1 — com movimentação, reconstrói a jornada com datas", () => {
    const r = planStages(
      card({ idList: "L_CONC" }),
      [
        mov("DISEÑO - MARTIN", "REVISIÓN", "2026-08-14T10:00:00Z"),
        mov("REVISIÓN", "LIBERADO", "2026-08-14T15:00:00Z"),
        mov("LIBERADO", "Concluido", "2026-08-15T09:00:00Z"),
      ],
      ctx()
    );
    expect(r.tier).toBe(1);
    expect(r.stages.map((s) => s.stageName)).toEqual(["Desenho", "Quality Control", "Aprovação"]);
    expect(r.stages[1].enteredAt).toEqual(new Date("2026-08-14T10:00:00Z"));
    expect(r.stages[1].exitedAt).toEqual(new Date("2026-08-14T15:00:00Z"));
  });

  it("nível 2 — sem movimentação, o anexo diz quem produziu e quando", () => {
    const r = planStages(
      card({
        idList: "L_MARTIN",
        attachments: [anexo({ idMember: "tMartin", date: "2026-04-02T12:00:00Z" })],
      }),
      [],
      ctx()
    );
    expect(r.tier).toBe(2);
    expect(r.stages).toHaveLength(1);
    expect(r.stages[0]).toMatchObject({ stageName: "Desenho", assigneeTrelloId: "tMartin" });
    expect(r.stages[0].enteredAt).toEqual(new Date("2026-04-02T12:00:00Z"));
  });

  it("nível 3 — só a lista de origem, sem data de etapa", () => {
    const r = planStages(card({ idList: "L_AV" }), [], ctx());
    expect(r.tier).toBe(3);
    expect(r.stages.map((s) => s.stageName)).toEqual(["Audio Visual"]);
    expect(r.stages[0].enteredAt).toBeUndefined();
  });

  it("NUNCA inclui etapa sem evidência", () => {
    const r = planStages(card({ idList: "L_CONC" }), [], ctx());
    const nomes = r.stages.map((s) => s.stageName);
    expect(nomes).not.toContain("Briefing");
    expect(nomes).not.toContain("Relatório");
    expect(nomes).not.toContain("Quality Control"); // estar em Concluido não prova que passou pela revisão
  });

  it("card de vídeo inclui Audio Visual e exclui Desenho, e vice-versa", () => {
    const rVideo = planStages(card({ idList: "L_AV" }), [], ctx());
    expect(rVideo.stages.map((s) => s.stageName)).toEqual(["Audio Visual"]);
    expect(rVideo.stages.map((s) => s.stageName)).not.toContain("Desenho");

    const rDesenho = planStages(card({ idList: "L_MARTIN" }), [], ctx());
    expect(rDesenho.stages.map((s) => s.stageName)).toEqual(["Desenho"]);
    expect(rDesenho.stages.map((s) => s.stageName)).not.toContain("Audio Visual");
    // com Martin como responsável — a lista já diz quem é, mesmo sem anexo (nível 3)
    expect(rDesenho.stages[0].assigneeTrelloId).toBe("tMartin");
  });

  it("movimento direto para Concluido não sintetiza Quality Control nem Aprovação — a armadilha do export real", () => {
    // No export real: `DISEÑO - MARTIN → Concluido` pula REVISIÓN e LIBERADO de fato.
    const r = planStages(
      card({ idList: "L_CONC" }),
      [mov("DISEÑO - MARTIN", "Concluido", "2026-08-14T10:00:00Z")],
      ctx()
    );
    expect(r.tier).toBe(1);
    expect(r.stages.map((s) => s.stageName)).toEqual(["Desenho"]);
  });

  it("lista não mapeada (ex: COMUNICADOR) não produz etapa nenhuma", () => {
    const r = planStages(
      card({ idList: "L_CONC" }),
      [mov("COMUNICADOR", "Concluido", "2026-08-14T10:00:00Z")],
      ctx()
    );
    expect(r.tier).toBe(1);
    expect(r.stages).toEqual([]);
  });

  it("anexo sem data não sustenta nível 2 — cai para nível 3", () => {
    const r = planStages(
      card({ idList: "L_AV", attachments: [anexo({ idMember: "tAlguem", date: null })] }),
      [],
      ctx()
    );
    expect(r.tier).toBe(3);
    expect(r.stages[0].enteredAt).toBeUndefined();
  });

  it("etapa concluída em nível 1 leva completed=true; sem evidência de saída leva completed=false", () => {
    const r1 = planStages(
      card({ idList: "L_CONC" }),
      [mov("DISEÑO - MARTIN", "Concluido", "2026-08-14T10:00:00Z")],
      ctx()
    );
    expect(r1.stages[0].completed).toBe(true);

    const r3 = planStages(card({ idList: "L_AV" }), [], ctx());
    expect(r3.stages[0].completed).toBe(false);
  });
});
