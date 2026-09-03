import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IMPORT_FAILURE_CODES } from "@/lib/nas/import-source";

/**
 * Guarda de paridade dos códigos de falha de importação.
 *
 * `IMPORT_FAILURE_CODES` é exportado e usado por ninguém — é documentação fingindo ser código.
 * Pior: o guarda de i18n existente (`status-dictionaries.test.ts`) compara pt-BR contra es-ES entre
 * si, então um código de falha SEM chave em locale nenhum passa despercebido nos dois idiomas, e a
 * tela mostraria o código cru (`tasks.artifacts.nasFailure.<código>` ausente) para o usuário.
 *
 * Este teste lê `IMPORT_FAILURE_CODES` — a fonte da verdade — e exige a chave correspondente em
 * `tasks.artifacts.nasFailure` nos DOIS locales.
 */

const LOCALES_DIR = join(process.cwd(), "locales");

function nasFailureDict(locale: string): Record<string, unknown> {
  const json = JSON.parse(readFileSync(join(LOCALES_DIR, locale, "tasks.json"), "utf8"));
  return json.artifacts?.nasFailure ?? {};
}

describe("paridade de tasks.artifacts.nasFailure com IMPORT_FAILURE_CODES", () => {
  it("IMPORT_FAILURE_CODES não está vazio (senão o teste passaria comparando com nada)", () => {
    expect(IMPORT_FAILURE_CODES.length).toBeGreaterThan(0);
  });

  for (const locale of ["pt-BR", "es-ES"]) {
    it(`[${locale}] toda entrada de IMPORT_FAILURE_CODES tem chave em nasFailure`, () => {
      const dict = nasFailureDict(locale);
      const faltando = IMPORT_FAILURE_CODES.filter((code) => typeof dict[code] !== "string");
      expect(faltando, `códigos sem chave em ${locale}/tasks.json → nasFailure`).toEqual([]);
    });
  }
});
