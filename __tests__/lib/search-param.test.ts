import { describe, it, expect } from "vitest";
import { parseSearchTerm, SEARCH_TERM_MAX } from "@/lib/search-param";

describe("parseSearchTerm", () => {
  it("devolve o termo limpo", () => {
    expect(parseSearchTerm("  Acme  ")).toBe("Acme");
  });

  it("ausência de busca → undefined, não string vazia", () => {
    // O caller usa undefined para OMITIR a cláusula where. Devolver "" faria
    // `contains: ""` casar com tudo — inofensivo no resultado, mas um scan
    // desnecessário em toda visita à lista.
    expect(parseSearchTerm(undefined)).toBeUndefined();
    expect(parseSearchTerm("")).toBeUndefined();
  });

  it("espaço em branco puro conta como sem busca", () => {
    // Quem apagou o campo e deixou um espaço não pediu para filtrar nada.
    expect(parseSearchTerm("   ")).toBeUndefined();
    expect(parseSearchTerm("\t\n")).toBeUndefined();
  });

  it("limita o tamanho do termo", () => {
    const long = "a".repeat(SEARCH_TERM_MAX + 50);
    expect(parseSearchTerm(long)).toHaveLength(SEARCH_TERM_MAX);
  });

  it("usa o primeiro valor quando o param vem repetido (?q=a&q=b)", () => {
    expect(parseSearchTerm(["Acme", "Outro"])).toBe("Acme");
  });

  it("array vazio ou não-string → undefined", () => {
    expect(parseSearchTerm([])).toBeUndefined();
    expect(parseSearchTerm(undefined)).toBeUndefined();
  });

  it("preserva acento e caixa (o insensitive é do banco, não daqui)", () => {
    expect(parseSearchTerm("Ação")).toBe("Ação");
    expect(parseSearchTerm("ACME")).toBe("ACME");
  });
});
