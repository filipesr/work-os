import { describe, expect, it } from "vitest";
import { planRework, type ReworkEvent } from "@/lib/trello/map-rework";
import type { CardMovement } from "@/lib/trello/types";
import type { MapStagesContext } from "@/lib/trello/map-stages";

/** Helper: cria uma movimentação entre listas. */
function mov(fromListName: string, toListName: string, at: string): CardMovement {
  return { fromListName, toListName, at };
}

/** Helper: cria um contexto com os nomes de lista. */
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

describe("planRework", () => {
  it("devolução da revisão é retrabalho INTERNO atribuído à etapa que INJETOU o defeito", () => {
    const r = planRework([mov("REVISIÓN", "DISEÑO - MARTIN", "2026-08-20T11:00:00Z")], ctx());
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("INTERNAL");
    // A origem é o DESENHO, que produziu o defeito — não a revisão, que o encontrou.
    // Trocar isso mediria quem acha defeito em vez de onde ele nasce (P5).
    expect(r[0].sourceStageName).toBe("Desenho");
    expect(r[0].at).toEqual(new Date("2026-08-20T11:00:00Z"));
  });

  it("devolução para audiovisual atribui ao Audio Visual", () => {
    const r = planRework([mov("REVISIÓN", "AUDIOVISUAL", "2026-08-20T11:30:00Z")], ctx());
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe("INTERNAL");
    expect(r[0].sourceStageName).toBe("Audio Visual");
    expect(r[0].at).toEqual(new Date("2026-08-20T11:30:00Z"));
  });

  it("saída da revisão para LIBERADO não é retrabalho", () => {
    expect(planRework([mov("REVISIÓN", "LIBERADO", "2026-08-20T15:00:00Z")], ctx())).toEqual([]);
  });

  it("movimento que não sai da revisão não é retrabalho", () => {
    expect(planRework([mov("DISEÑO - MARTIN", "REVISIÓN", "2026-08-20T14:00:00Z")], ctx())).toEqual(
      []
    );
  });
});
