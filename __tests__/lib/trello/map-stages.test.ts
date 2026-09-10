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
  it("nível 1 — com movimentação, reconstrói a jornada com datas por segmento", () => {
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
    expect(r.stages[1].segments).toHaveLength(1);
    expect(r.stages[1].segments[0].enteredAt).toEqual(new Date("2026-08-14T10:00:00Z"));
    expect(r.stages[1].segments[0].exitedAt).toEqual(new Date("2026-08-14T15:00:00Z"));
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
    expect(r.stages[0].segments).toHaveLength(1);
    expect(r.stages[0].segments[0].enteredAt).toEqual(new Date("2026-04-02T12:00:00Z"));
  });

  it("nível 3 — só a lista de origem, sem data de etapa", () => {
    const r = planStages(card({ idList: "L_AV" }), [], ctx());
    expect(r.tier).toBe(3);
    expect(r.stages.map((s) => s.stageName)).toEqual(["Audio Visual"]);
    expect(r.stages[0].segments).toHaveLength(1);
    expect(r.stages[0].segments[0].enteredAt).toBeUndefined();
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
    expect(r.stages[0].segments[0].enteredAt).toBeUndefined();
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

  describe("devolução: revisitar uma etapa não pode fundir visitas nem fabricar duração", () => {
    it("DISEÑO → REVISIÓN → DISEÑO → REVISIÓN → LIBERADO produz dois segmentos em Desenho e em Quality Control", () => {
      const r = planStages(
        card({ idList: "L_LIBERADO" }),
        [
          mov("DISEÑO - MARTIN", "REVISIÓN", "2026-08-10T09:00:00Z"), // t1: sai do Desenho
          mov("REVISIÓN", "DISEÑO - MARTIN", "2026-08-10T10:00:00Z"), // t2: devolução — sai do QC
          mov("DISEÑO - MARTIN", "REVISIÓN", "2026-08-12T09:00:00Z"), // t3: sai do Desenho de novo
          mov("REVISIÓN", "LIBERADO", "2026-08-12T14:00:00Z"), // t4: sai do QC de novo
        ],
        ctx()
      );
      expect(r.tier).toBe(1);

      const desenho = r.stages.find((s) => s.stageName === "Desenho")!;
      expect(desenho.segments).toHaveLength(2);
      expect(desenho.segments[0]).toEqual({
        enteredAt: undefined,
        exitedAt: new Date("2026-08-10T09:00:00Z"),
      });
      expect(desenho.segments[1]).toEqual({
        enteredAt: new Date("2026-08-10T10:00:00Z"),
        exitedAt: new Date("2026-08-12T09:00:00Z"),
      });
      expect(desenho.completed).toBe(true);

      const qc = r.stages.find((s) => s.stageName === "Quality Control")!;
      expect(qc.segments).toHaveLength(2);
      expect(qc.segments[0]).toEqual({
        enteredAt: new Date("2026-08-10T09:00:00Z"),
        exitedAt: new Date("2026-08-10T10:00:00Z"),
      });
      expect(qc.segments[1]).toEqual({
        enteredAt: new Date("2026-08-12T09:00:00Z"),
        exitedAt: new Date("2026-08-12T14:00:00Z"),
      });
      expect(qc.completed).toBe(true);

      const aprovacao = r.stages.find((s) => s.stageName === "Aprovação")!;
      expect(aprovacao.segments).toHaveLength(1);
      expect(aprovacao.segments[0].exitedAt).toBeUndefined();
      expect(aprovacao.completed).toBe(false);

      // Nenhum segmento pode cobrir tempo fora da etapa: a excursão de 1h em REVISIÓN (t1..t2) não
      // pode aparecer dentro de um segmento de Desenho, e vice-versa.
      const desenhoSpansMs = desenho.segments
        .filter((s) => s.enteredAt && s.exitedAt)
        .map((s) => s.exitedAt!.getTime() - s.enteredAt!.getTime());
      for (const span of desenhoSpansMs) {
        expect(span).toBeLessThanOrEqual(2 * 24 * 60 * 60 * 1000); // nenhum segmento > 2 dias aqui
      }
    });
  });

  describe("autor do anexo quando há vários — o autor com mais anexos vence, empate o mais antigo", () => {
    it("um autor só: assigneeTrelloId é o autor, mesmo com vários anexos dele", () => {
      const r = planStages(
        card({
          idList: "L_MARTIN",
          attachments: [
            anexo({ id: "a1", idMember: "tMartin", date: "2026-04-01T10:00:00Z" }),
            anexo({ id: "a2", idMember: "tMartin", date: "2026-04-02T10:00:00Z" }),
          ],
        }),
        [],
        ctx()
      );
      expect(r.stages[0].assigneeTrelloId).toBe("tMartin");
    });

    it("três anexos de A contra um de B mais antigo — vence A, não quem anexou primeiro", () => {
      const r = planStages(
        card({
          idList: "L_MARTIN",
          attachments: [
            anexo({ id: "a1", idMember: "tB", date: "2026-04-01T09:00:00Z" }), // B: mais antigo, só 1
            anexo({ id: "a2", idMember: "tA", date: "2026-04-01T10:00:00Z" }),
            anexo({ id: "a3", idMember: "tA", date: "2026-04-01T11:00:00Z" }),
            anexo({ id: "a4", idMember: "tA", date: "2026-04-01T12:00:00Z" }),
          ],
        }),
        [],
        ctx()
      );
      expect(r.stages[0].assigneeTrelloId).toBe("tA");
    });
  });

  it("anexo sem idMember não herda o responsável da lista — o nível 2 vem só do anexo, ponto", () => {
    const r = planStages(
      card({ idList: "L_MARTIN", attachments: [anexo({ date: "2026-04-01T10:00:00Z" })] }), // sem idMember
      [],
      ctx()
    );
    expect(r.tier).toBe(2);
    // A lista ("DISEÑO - MARTIN") resolveria "tMartin" via ctx — mas nível 2 não pode herdar isso.
    expect(r.stages[0].assigneeTrelloId).toBeUndefined();
  });

  describe("nível 2 — lista sem correspondência de produção: o mimeType do anexo decide a etapa", () => {
    // "L_JULIO" não está em listNamesById (ctx()) — mapeia para nenhuma etapa, como as listas
    // organizacionais reais do quadro (Julio, ANOTACIONES, Concluido sem movimentação). É evidência,
    // não inferência: o arquivo anexado prova o que foi produzido, mesmo quando a lista não prova
    // por onde o card andou.
    it("anexo de vídeo vira Audio Visual", () => {
      const r = planStages(
        card({
          idList: "L_JULIO",
          attachments: [
            anexo({ idMember: "tAlguem", date: "2026-04-01T10:00:00Z", mimeType: "video/mp4" }),
          ],
        }),
        [],
        ctx()
      );
      expect(r.tier).toBe(2);
      expect(r.stages).toHaveLength(1);
      expect(r.stages[0].stageName).toBe("Audio Visual");
    });

    it("anexo de imagem vira Desenho", () => {
      const r = planStages(
        card({
          idList: "L_JULIO",
          attachments: [
            anexo({ idMember: "tAlguem", date: "2026-04-01T10:00:00Z", mimeType: "image/png" }),
          ],
        }),
        [],
        ctx()
      );
      expect(r.tier).toBe(2);
      expect(r.stages).toHaveLength(1);
      expect(r.stages[0].stageName).toBe("Desenho");
    });

    it("anexo PDF também vira Desenho", () => {
      const r = planStages(
        card({
          idList: "L_JULIO",
          attachments: [
            anexo({
              idMember: "tAlguem",
              date: "2026-04-01T10:00:00Z",
              mimeType: "application/pdf",
            }),
          ],
        }),
        [],
        ctx()
      );
      expect(r.stages[0].stageName).toBe("Desenho");
    });

    it("anexo misto (imagem e vídeo no mesmo card): vídeo vence — produzir o vídeo já implica ter produzido as artes que entram nele", () => {
      const r = planStages(
        card({
          idList: "L_JULIO",
          attachments: [
            anexo({
              id: "a1",
              idMember: "tAlguem",
              date: "2026-04-01T09:00:00Z",
              mimeType: "image/png",
            }),
            anexo({
              id: "a2",
              idMember: "tAlguem",
              date: "2026-04-01T10:00:00Z",
              mimeType: "video/mp4",
            }),
          ],
        }),
        [],
        ctx()
      );
      expect(r.stages).toHaveLength(1);
      expect(r.stages[0].stageName).toBe("Audio Visual");
    });

    it("anexo de tipo não reconhecido (nem vídeo, nem imagem, nem PDF) continua sem etapa — indeterminado", () => {
      const r = planStages(
        card({
          idList: "L_JULIO",
          attachments: [
            anexo({
              idMember: "tAlguem",
              date: "2026-04-01T10:00:00Z",
              mimeType: "application/zip",
            }),
          ],
        }),
        [],
        ctx()
      );
      expect(r.tier).toBe(2);
      expect(r.stages).toEqual([]);
    });

    it("quando a lista JÁ é de produção, o mimeType não é consultado — a lista continua decidindo", () => {
      // Card em "DISEÑO - MARTIN" com anexo de vídeo: a lista já resolve a etapa (Desenho); o
      // mimeType só entra como desempate quando a lista NÃO decide.
      const r = planStages(
        card({
          idList: "L_MARTIN",
          attachments: [
            anexo({ idMember: "tMartin", date: "2026-04-01T10:00:00Z", mimeType: "video/mp4" }),
          ],
        }),
        [],
        ctx()
      );
      expect(r.stages[0].stageName).toBe("Desenho");
    });
  });
});
