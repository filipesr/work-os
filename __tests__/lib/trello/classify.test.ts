import fs from "fs";
import { describe, expect, it } from "vitest";
import { cardNature, type Card, type LabelsById } from "@/lib/trello/classify";

const exportPath =
  "/Users/fsrezende/Downloads/goon/atl/export trello/INm0k5De - atlantico-shop.json";
const exportExists = fs.existsSync(exportPath);

/** Helper: cria um card com os valores padrão para teste. */
function card(overrides: Partial<Card> = {}): Card {
  return {
    name: "",
    idLabels: [],
    attachments: [],
    ...overrides,
  };
}

/** Helper: cria um anexo simples. */
function anexo() {
  return { id: "att-001" };
}

describe("natureza do card", () => {
  it("separadores visuais não são demanda", () => {
    for (const t of [
      "PRIORIDAD 👆",
      "EN PROCESO ⬆️",
      "-------------------------------------",
      "☝ ALTERACIÓN ☝",
      "Haciendo☝",
      "PARA HACER 👆",
    ]) {
      expect(cardNature(card({ name: t }), {}), t).toBe("separador");
    }
  });

  it("ausências e eventos não são demanda", () => {
    for (const t of [
      "FERIADO 14/05",
      "FÉRIAS 09 A 16/06",
      "DIA LIBRE 15/05",
      "SABADO LIVRE 14/06",
      "REUNIÓN JULIO 23/06",
    ]) {
      expect(cardNature(card({ name: t }), {}), t).toBe("ausencia");
    }
  });

  it("instrução e referência não são demanda", () => {
    for (const t of [
      "TAMAÑO - Banners Web",
      "ACCESSOS",
      "MODELO - SOLICITAÇÃO Briefing",
      "Modelo - Pedido Tráfego",
      "MODELO - Checklist materiais campanhas",
    ]) {
      expect(cardNature(card({ name: t }), {}), t).toBe("referencia");
    }
  });

  it("trabalho de verdade é demanda", () => {
    for (const t of [
      "Identidad Albirroa ATL",
      "Carrusel de carnaval",
      "VIDEO - CAMPAÑA Atlantic Essence",
      "Capa Reel",
    ]) {
      expect(cardNature(card({ name: t }), {}), t).toBe("demanda");
    }
  });

  it("card com anexo é demanda mesmo com rótulo MODELO — o arquivo é a evidência", () => {
    const c = card({ name: "MODELO x", idLabels: ["L1"], attachments: [anexo()] });
    expect(cardNature(c, { L1: "MODELO" })).toBe("demanda");
  });

  it("card com rótulo MODELO mas sem anexo é referência", () => {
    const c = card({ name: "Algo", idLabels: ["L1"], attachments: [] });
    expect(cardNature(c, { L1: "MODELO" })).toBe("referencia");
  });

  it("card com rótulo MODELO e com anexo (via rótulo) é demanda mesmo sem 'modelo' no título", () => {
    const c = card({ name: "Peça de campanha", idLabels: ["L1"], attachments: [anexo()] });
    expect(cardNature(c, { L1: "MODELO" })).toBe("demanda");
  });

  it("ausência sem anexo é ausência", () => {
    expect(cardNature(card({ name: "FERIADO 14/05", attachments: [] }), {})).toBe("ausencia");
  });

  it("ausência com anexo é demanda (anexo é evidência de trabalho real)", () => {
    const c = card({
      name: "Historia Instagram: Vacaciones de Invierno",
      attachments: [anexo()],
    });
    expect(cardNature(c, {})).toBe("demanda");
  });
});

describe("contagem contra export real", () => {
  it.skipIf(!exportExists)(
    "export tem as contagens esperadas (arquivo fora do repo, não existe em CI)",
    () => {
      const data = JSON.parse(fs.readFileSync(exportPath, "utf-8"));
      const cards = data.cards || [];

      // Construir mapa de labels: id -> name
      const labels = data.labels || [];
      const labelsById: LabelsById = {};
      for (const label of labels) {
        labelsById[label.id] = label.name;
      }

      // Classificar todos os cards
      const counts = { demanda: 0, separador: 0, ausencia: 0, referencia: 0 };
      for (const card of cards) {
        const nature = cardNature(card, labelsById);
        counts[nature]++;
      }

      const total = counts.demanda + counts.separador + counts.ausencia + counts.referencia;

      // Verificar contagens novas (corrigidas pelo briefing)
      expect(counts.demanda).toBe(230);
      expect(counts.separador).toBe(38);
      expect(counts.ausencia).toBe(25);
      expect(counts.referencia).toBe(10);

      // Verificar soma contra total de cards
      expect(total).toBe(cards.length);
    }
  );
});
