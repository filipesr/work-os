import { describe, it, expect, vi, beforeEach } from "vitest";
import { eventsForYear } from "@/lib/calendar/events";
import {
  materializeYear,
  toOccurrenceData,
  kindOf,
  isoToUtcMidnight,
} from "@/lib/calendar/materialize";

function makeClient(existingCuratedIds: string[] = []) {
  const known = new Set(existingCuratedIds);
  return {
    calendarOccurrence: {
      findUnique: vi.fn(async ({ where }: { where: { curatedId: string } }) =>
        known.has(where.curatedId) ? { id: `row-${where.curatedId}` } : null
      ),
      // Tipar os args explicitamente: `vi.fn(async () => …)` infere aridade
      // zero, e as asserções abaixo inspecionam `mock.calls[0][0]`.
      create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})),
      update: vi.fn(
        async (_args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({})
      ),
    },
  };
}

describe("mapeamento catálogo → ocorrência", () => {
  it("data comercial vira COMMERCIAL, feriado vira HOLIDAY", () => {
    const events = eventsForYear(2026);
    const commercial = events.find((e) => e.type === "commercial")!;
    const holiday = events.find((e) => e.type === "holiday")!;
    expect(kindOf(commercial)).toBe("COMMERCIAL");
    expect(kindOf(holiday)).toBe("HOLIDAY");
  });

  it("converte a data para meia-noite UTC (dia de calendário, não instante)", () => {
    const d = isoToUtcMidnight("2026-10-12");
    expect(d.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("marca a origem como CURATED e leva o curatedId", () => {
    const event = eventsForYear(2026)[0];
    const data = toOccurrenceData(event);
    expect(data.source).toBe("CURATED");
    expect(data.curatedId).toBe(event.id);
  });
});

describe("seriesKey — liga as edições anuais", () => {
  it("a mesma data em anos diferentes compartilha seriesKey", () => {
    const a = eventsForYear(2026).find((e) => e.titlePt === "Dia das Crianças")!;
    const b = eventsForYear(2027).find((e) => e.titlePt === "Dia das Crianças")!;
    expect(a.seriesKey).toBe(b.seriesKey);
  });

  it("mas NÃO compartilha id — cada edição é uma ocorrência própria", () => {
    // É o que impede que uma demanda vinculada ao Dia das Crianças de 2026
    // apareça como cobertura de 2027.
    const a = eventsForYear(2026).find((e) => e.titlePt === "Dia das Crianças")!;
    const b = eventsForYear(2027).find((e) => e.titlePt === "Dia das Crianças")!;
    expect(a.id).not.toBe(b.id);
  });

  it("datas homônimas de países diferentes têm séries distintas", () => {
    const br = eventsForYear(2026).find((e) => e.titlePt === "Dia das Mães")!;
    const ar = eventsForYear(2026).find((e) => e.titlePt === "Dia das Mães (AR)")!;
    expect(br.seriesKey).not.toBe(ar.seriesKey);
  });
});

describe("materializeYear", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cria as ocorrências ausentes", async () => {
    const client = makeClient();
    const result = await materializeYear(client as never, 2026);
    expect(result.created).toBe(eventsForYear(2026).length);
    expect(result.updated).toBe(0);
    expect(client.calendarOccurrence.update).not.toHaveBeenCalled();
  });

  it("é idempotente: rodar de novo atualiza, não duplica", async () => {
    const all = eventsForYear(2026).map((e) => e.id);
    const client = makeClient(all);
    const result = await materializeYear(client as never, 2026);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(all.length);
    expect(client.calendarOccurrence.create).not.toHaveBeenCalled();
  });

  it("casa SEMPRE por curatedId — é o que protege as datas próprias", async () => {
    // Uma linha CUSTOM tem curatedId null, então nunca casa com o where do
    // upsert. É essa a garantia de que "gerar o ano que vem" não apaga a
    // FestPop que alguém cadastrou à mão.
    const client = makeClient();
    await materializeYear(client as never, 2026);
    for (const call of client.calendarOccurrence.findUnique.mock.calls) {
      expect(call[0].where).toHaveProperty("curatedId");
      expect(call[0].where.curatedId).toBeTruthy();
    }
  });

  it("nunca reescreve source nem curatedId ao atualizar", async () => {
    const all = eventsForYear(2026).map((e) => e.id);
    const client = makeClient(all);
    await materializeYear(client as never, 2026);
    for (const call of client.calendarOccurrence.update.mock.calls) {
      expect(call[0].data).not.toHaveProperty("source");
      expect(call[0].data).not.toHaveProperty("curatedId");
    }
  });
});

describe("estabilidade dos curatedId (snapshot)", () => {
  it("os ids do catálogo não mudam sem intenção", () => {
    // O curatedId é a chave de deduplicação. Se o slugify for "consertado"
    // (normalizar acentos, por exemplo), TODOS os ids mudam e a próxima
    // materialização duplica o catálogo inteiro em vez de atualizá-lo.
    // Este teste transforma isso num erro visível em vez de uma surpresa no banco.
    const ids = eventsForYear(2026).map((e) => e.id);
    expect(ids).toContain("2026-10-12-d-a-del-ni-o-br");
    expect(ids).toContain("2026-11-27-black-friday");
    expect(ids).toContain("2026-01-01-a-o-nuevo");
    expect(ids.length).toBe(41);
    // Nenhum id duplicado — dois eventos no mesmo dia com o mesmo título
    // colidiriam na constraint única e quebrariam a materialização.
    expect(new Set(ids).size).toBe(ids.length);
  });
});
