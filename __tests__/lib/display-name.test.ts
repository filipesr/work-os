import { describe, it, expect } from "vitest";
import { normalizeDisplayName, validateDisplayName, isValidDisplayName } from "@/lib/display-name";

// A regra pedida foi "apenas letras e espaço". Estes testes travam as duas fronteiras onde a regra
// literal erraria: acentos (são letras, e sem eles metade dos nomes em pt/es fica errado) e os
// sobrenomes com apóstrofo/hífen, que existem de verdade.

describe("normalizeDisplayName", () => {
  it("colapsa espaços e apara as pontas", () => {
    // Recusar por espaço duplo puniria a pessoa por algo que ela nem enxerga.
    expect(normalizeDisplayName("  Ana   Maria  ")).toBe("Ana Maria");
  });
});

describe("validateDisplayName — aceita", () => {
  it.each([
    ["Ana Maria", "nome simples"],
    ["José Antônio Gonçalves", "acentos e cedilha do português"],
    ["María José Núñez", "acentos e ñ do espanhol"],
    ["Ana Luísa D'Ávila", "apóstrofo reto"],
    ["Ana Luísa D’Ávila", "apóstrofo tipográfico (o que o teclado do macOS produz)"],
    ["Anne-Marie", "hífen"],
    ["Ío", "dois caracteres, o mínimo"],
  ])("%s (%s)", (nome) => {
    expect(validateDisplayName(nome)).toBeNull();
  });
});

describe("validateDisplayName — recusa", () => {
  it("vazio ou só espaço", () => {
    expect(validateDisplayName("")).toBe("empty");
    expect(validateDisplayName("    ")).toBe("empty");
  });

  it("uma letra só", () => {
    expect(validateDisplayName("A")).toBe("tooShort");
  });

  it("longo demais", () => {
    expect(validateDisplayName("A".repeat(61))).toBe("tooLong");
  });

  it.each([
    ["Ana 2", "número"],
    ["Ana 😀", "emoji"],
    ["Ana <script>", "símbolos"],
    ["Ana_Maria", "underscore"],
    ["Ana.Maria", "ponto"],
    ["ana@empresa.com", "e-mail no lugar do nome"],
  ])("%s (%s)", (nome) => {
    expect(validateDisplayName(nome)).toBe("invalidChars");
  });

  it("não começa nem termina em apóstrofo ou hífen", () => {
    // As âncoras em letra cobrem isto sem precisar de regra separada.
    for (const nome of ["-Ana", "Ana-", "'Ana", "Ana'"]) {
      expect(validateDisplayName(nome), nome).toBe("invalidChars");
    }
  });
});

describe("isValidDisplayName", () => {
  it("é o mesmo julgamento, em booleano", () => {
    expect(isValidDisplayName("José Antônio")).toBe(true);
    expect(isValidDisplayName("José 3")).toBe(false);
  });
});
