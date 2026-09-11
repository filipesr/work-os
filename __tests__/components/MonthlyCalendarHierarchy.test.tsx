import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    vals ? `${key}:${JSON.stringify(vals)}` : key,
  useLocale: () => "pt-BR",
}));

// Os três diálogos puxam server actions (e, por tabela, o next-auth) só por serem importados. Nada
// do que se testa aqui depende deles: a hierarquia da célula é desenhada antes de qualquer clique.
vi.mock("@/components/planning/calendar/BatchCreateDialog", () => ({
  BatchCreateDialog: () => null,
}));
vi.mock("@/components/planning/calendar/DayDemandsDialog", () => ({
  DayDemandsDialog: () => null,
}));
vi.mock("@/components/planning/calendar/DayDetailDialog", () => ({ DayDetailDialog: () => null }));

import { MonthlyCalendar } from "@/components/planning/calendar/MonthlyCalendar";

const DIA = "2026-10-01";

const dias = [{ iso: DIA, day: 1, inMonth: true, isToday: false }];

const datas = {
  [DIA]: [
    {
      id: "e1",
      iso: DIA,
      title: "Dia da Música",
      countries: ["AR", "BR", "PY"] as ("AR" | "BR" | "PY")[],
      type: "commercial" as const,
    },
    {
      id: "e2",
      iso: DIA,
      title: "Dia do Bombeiro",
      countries: ["PY"] as ("AR" | "BR" | "PY")[],
      type: "holiday" as const,
    },
  ],
};

const demandas = {
  [DIA]: [
    {
      clientId: "c1",
      clientName: "AtlanticoShop",
      tasks: [
        { id: "t1", title: "Post", status: "IN_PROGRESS", state: "onTrack" },
        { id: "t2", title: "Reel", status: "IN_PROGRESS", state: "onTrack" },
      ],
    },
  ],
};

function montar() {
  return render(
    <MonthlyCalendar
      days={dias}
      eventsByDay={datas as never}
      demandsByDay={demandas as never}
      anniversariesByDay={{}}
      clients={[]}
      projects={[]}
      templates={[]}
    />
  );
}

/**
 * A célula do dia responde "o que a agência tem para entregar neste dia?". As datas comemorativas
 * são o pano de fundo dessa pergunta.
 *
 * Antes as duas coisas usavam a MESMA paleta (`bg-primary/10 text-primary`), a mesma altura de
 * fonte, e as datas vinham em cima: num dia com três comemorativas, a demanda do cliente virava a
 * quarta linha de uma pilha uniforme e passava despercebida. O que estes testes protegem é a
 * HIERARQUIA — não o tom exato, mas o fato de haver diferença e ordem.
 */
describe("MonthlyCalendar — hierarquia entre demanda e data", () => {
  it("a demanda do cliente vem ANTES das datas do dia", () => {
    montar();
    const demanda = screen.getByTitle("AtlanticoShop");
    const data = screen.getByTitle("Dia da Música");
    // `compareDocumentPosition` devolve FOLLOWING quando o segundo vem depois do primeiro.
    expect(demanda.compareDocumentPosition(data) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a demanda é preenchida; a data, não", () => {
    // É o que faz a diferença existir de relance. Sem o preenchimento sólido, os dois viram
    // retângulos do mesmo tom e a distinção depende de ler o texto.
    montar();
    expect(screen.getByTitle("AtlanticoShop").className).toContain("bg-primary");
    expect(screen.getByTitle("Dia da Música").className).not.toContain("bg-primary");
  });

  it("a demanda tem fonte maior que a data", () => {
    montar();
    expect(screen.getByTitle("AtlanticoShop").className).toContain("text-xs");
    expect(screen.getByTitle("Dia da Música").className).toContain("text-[11px]");
  });

  it("o feriado continua se distinguindo das outras datas", () => {
    // Ele muda o que é possível fazer no dia; apagá-lo junto com as comemorativas trocaria um
    // problema de hierarquia por outro.
    montar();
    expect(screen.getByTitle("Dia do Bombeiro").className).toContain("text-danger");
    expect(screen.getByTitle("Dia da Música").className).toContain("text-muted-foreground");
  });
});
