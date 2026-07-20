import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * i18n guard (P4): garante que os locais fiquem em paridade e sem vazamento de
 * português no es-ES. Roda no CI via `vitest`. Se um novo namespace/chave for
 * adicionado só em um locale, este teste falha listando as diferenças.
 */

const LOCALES_DIR = join(process.cwd(), "locales");
const LOCALES = ["pt-BR", "es-ES"] as const;

type Json = Record<string, unknown>;

function flatten(obj: Json, prefix = "", out: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flatten(v as Json, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

function loadFlat(locale: string, file: string) {
  return flatten(JSON.parse(readFileSync(join(LOCALES_DIR, locale, file), "utf8")));
}

const namespaces = readdirSync(join(LOCALES_DIR, "pt-BR")).filter((f) => f.endsWith(".json"));

describe("i18n locale parity", () => {
  it("has the same namespace files in every locale", () => {
    const base = readdirSync(join(LOCALES_DIR, "pt-BR")).sort();
    for (const locale of LOCALES) {
      const cur = readdirSync(join(LOCALES_DIR, locale)).sort();
      expect(cur, `namespace files differ for ${locale}`).toEqual(base);
    }
  });

  for (const file of namespaces) {
    it(`[${file}] pt-BR and es-ES have identical key sets`, () => {
      const pt = Object.keys(loadFlat("pt-BR", file)).sort();
      const es = Object.keys(loadFlat("es-ES", file)).sort();
      const missingInEs = pt.filter((k) => !es.includes(k));
      const missingInPt = es.filter((k) => !pt.includes(k));
      expect(missingInEs, `keys missing in es-ES/${file}`).toEqual([]);
      expect(missingInPt, `keys missing in pt-BR/${file}`).toEqual([]);
    });
  }

  // Portuguese-only orthography never occurs in Spanish — a hard signal of an
  // untranslated es-ES value. Current baseline is zero; keep it that way.
  const PT_ONLY = /[ãõçâêô]|ç|ções?|ção/;
  for (const file of namespaces) {
    it(`[${file}] es-ES has no Portuguese-only orthography`, () => {
      const es = loadFlat("es-ES", file);
      const leaks = Object.entries(es)
        .filter(([, v]) => typeof v === "string" && PT_ONLY.test(v as string))
        .map(([k, v]) => `${k} = "${v as string}"`);
      expect(leaks, `untranslated pt leaking into es-ES/${file}`).toEqual([]);
    });
  }
});
