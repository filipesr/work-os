import { describe, expect, it } from "vitest";
import { filterOccurrences, parseOccurrenceFilter } from "@/lib/calendar/occurrence-filter";

const linhas = [
  { id: "1", kind: "HOLIDAY", countries: ["BR"] },
  { id: "2", kind: "COMMERCIAL", countries: ["AR", "BR", "PY"] },
  { id: "3", kind: "COMMERCIAL", countries: ["PY"] },
  { id: "4", kind: "EVENT", countries: ["AR"] },
];

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("filterOccurrences", () => {
  it("sem filtro, devolve tudo — e a MESMA lista, sem recriar", () => {
    expect(filterOccurrences(linhas, {})).toBe(linhas);
  });

  it("filtra por tipo", () => {
    expect(ids(filterOccurrences(linhas, { kind: "COMMERCIAL" }))).toEqual(["2", "3"]);
    expect(ids(filterOccurrences(linhas, { kind: "HOLIDAY" }))).toEqual(["1"]);
  });

  it("filtra por país — uma data internacional aparece nos três", () => {
    expect(ids(filterOccurrences(linhas, { country: "PY" }))).toEqual(["2", "3"]);
    expect(ids(filterOccurrences(linhas, { country: "AR" }))).toEqual(["2", "4"]);
  });

  it("os dois juntos são E, não OU", () => {
    expect(ids(filterOccurrences(linhas, { kind: "COMMERCIAL", country: "AR" }))).toEqual(["2"]);
  });

  it("combinação sem nenhuma data devolve vazio, não tudo", () => {
    expect(filterOccurrences(linhas, { kind: "HOLIDAY", country: "PY" })).toEqual([]);
  });
});

describe("parseOccurrenceFilter", () => {
  it("lê os valores válidos", () => {
    expect(parseOccurrenceFilter({ dateKind: "HOLIDAY", country: "BR" })).toEqual({
      kind: "HOLIDAY",
      country: "BR",
    });
  });

  it("valor desconhecido é IGNORADO, não vira calendário vazio", () => {
    // Uma URL com `?dateKind=feriado` (ou um link antigo) não pode esvaziar a grade em silêncio:
    // quem olha não tem como saber se o mês está vazio ou se o filtro comeu tudo.
    expect(parseOccurrenceFilter({ dateKind: "feriado", country: "XX" })).toEqual({});
  });

  it("ausente é ausente", () => {
    expect(parseOccurrenceFilter({})).toEqual({});
    expect(parseOccurrenceFilter({ dateKind: "", country: "" })).toEqual({});
  });
});
