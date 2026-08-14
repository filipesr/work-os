import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEAM_PROFILES } from "@/lib/team-profiles/catalog";
import { REPORT_MODELS } from "@/lib/team-profiles/reports";

/**
 * Guard dos modelos de relatório.
 *
 * Três invariantes que só existem aqui, além da estrutura e da paridade:
 *
 *  - o modelo e o descritivo não podem divergir sobre destino e sensibilidade
 *    do mesmo artefato — a tela mostra os dois lados e a contradição seria
 *    invisível até alguém compartilhar o que não podia;
 *  - `destino: cliente` ⟺ `sensibilidade: CLIENTE`, a mesma regra dos
 *    descritivos (`lib/nas/sensitivity.ts`);
 *  - o esqueleto precisa ter campo a preencher e cobrir a anatomia — esqueleto
 *    que não bate com as seções manda a pessoa preencher outra coisa.
 */

const ROOT = process.cwd();
const LOCALES = ["pt-BR", "es-ES"] as const;

type Json = Record<string, unknown>;

function load(locale: string, file: string): Json {
  return JSON.parse(readFileSync(join(ROOT, "locales", locale, file), "utf8")) as Json;
}

const MODELS = Object.fromEntries(LOCALES.map((l) => [l, load(l, "reportModels.json")])) as Record<
  string,
  Json
>;
const PROFILES = Object.fromEntries(
  LOCALES.map((l) => [l, load(l, "teamProfiles.json")])
) as Record<string, Json>;

const DESTINATIONS = ["cliente", "gestao", "documentacao"] as const;
const SENSITIVITIES = ["CLIENTE", "INTERNO", "CONFIDENCIAL"] as const;

function modelAt(locale: string, slug: string): Json | undefined {
  return (MODELS[locale].models as Json)?.[slug] as Json | undefined;
}

function isNonEmptyStringList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === "string" && v.trim().length > 0)
  );
}

// ---------------------------------------------------------------------------

describe("catálogo de modelos de relatório", () => {
  it("aponta para funções que existem", () => {
    const slugs = TEAM_PROFILES.map((p) => p.slug);
    const orphans = REPORT_MODELS.filter((m) => !slugs.includes(m.profileSlug));
    expect(
      orphans.map((m) => m.slug),
      "modelo sem função dona"
    ).toEqual([]);
  });

  it("usa slugs únicos, destinos e sensibilidades válidos", () => {
    const slugs = REPORT_MODELS.map((m) => m.slug);
    expect(slugs.filter((s, i) => slugs.indexOf(s) !== i)).toEqual([]);
    expect(slugs.every((s) => /^[a-z0-9-]+$/.test(s))).toBe(true);

    for (const model of REPORT_MODELS) {
      expect(DESTINATIONS, `${model.slug}: destino inválido`).toContain(model.destino);
      expect(SENSITIVITIES, `${model.slug}: sensibilidade inválida`).toContain(model.sensibilidade);
      // CLIENTE é o único nível compartilhável para fora.
      expect(
        model.destino === "cliente",
        `${model.slug}: destino ${model.destino} com sensibilidade ${model.sensibilidade}`
      ).toBe(model.sensibilidade === "CLIENTE");
    }
  });

  // O descritivo declara o artefato; o modelo o detalha. Se os dois discordarem
  // sobre para quem vai, a pessoa segue o que estiver na tela em que estiver.
  it("não diverge do descritivo sobre destino e sensibilidade", () => {
    for (const locale of LOCALES) {
      const profiles = PROFILES[locale].profiles as Json;

      for (const model of REPORT_MODELS) {
        const profile = profiles[model.profileSlug] as Json | undefined;
        const declared = (profile?.relatorios as Json[] | undefined)?.find(
          (r) => r.modelo === model.slug
        );

        expect(
          declared,
          `[${locale}] nenhum relatório de "${model.profileSlug}" aponta para o modelo "${model.slug}"`
        ).toBeDefined();
        expect(declared!.destino, `[${locale}] ${model.slug}: destino divergente`).toBe(
          model.destino
        );
        expect(declared!.sensibilidade, `[${locale}] ${model.slug}: sensibilidade divergente`).toBe(
          model.sensibilidade
        );
      }
    }
  });

  it("não deixa `modelo` apontando para um slug que não existe", () => {
    const known = new Set(REPORT_MODELS.map((m) => m.slug));
    for (const locale of LOCALES) {
      const profiles = PROFILES[locale].profiles as Json;
      const dangling: string[] = [];
      for (const [slug, profile] of Object.entries(profiles)) {
        for (const report of (profile as Json).relatorios as Json[]) {
          if (report.modelo && !known.has(report.modelo as string)) {
            dangling.push(`${slug} → ${String(report.modelo)}`);
          }
        }
      }
      expect(dangling, `[${locale}] referências quebradas`).toEqual([]);
    }
  });
});

describe.each(LOCALES)("reportModels.json [%s]", (locale) => {
  it("tem um bloco de grupo para cada destino", () => {
    const groups = (MODELS[locale].index as Json).groups as Json;
    expect(DESTINATIONS.filter((d) => !groups?.[d])).toEqual([]);
  });

  it("não tem modelo órfão (conteúdo escrito sem entrada no catálogo)", () => {
    const slugs = REPORT_MODELS.map((m) => m.slug);
    const orphans = Object.keys(MODELS[locale].models as Json).filter((s) => !slugs.includes(s));
    expect(orphans).toEqual([]);
  });

  describe.each(REPORT_MODELS.map((m) => m.slug))("modelo %s", (slug) => {
    it("tem todas as seções preenchidas", () => {
      const model = modelAt(locale, slug);
      expect(model, `modelo ${slug} ausente em ${locale}`).toBeDefined();

      for (const key of ["titulo", "resumo", "paraQue", "leitor", "quando", "esqueleto"] as const) {
        expect(typeof model![key], `${slug}.${key}`).toBe("string");
        expect((model![key] as string).trim().length, `${slug}.${key} vazio`).toBeGreaterThan(0);
      }

      for (const key of ["regras", "erros"] as const) {
        expect(isNonEmptyStringList(model![key]), `${slug}.${key}`).toBe(true);
      }

      const estrutura = model!.estrutura as Json[];
      expect(Array.isArray(estrutura) && estrutura.length >= 3, `${slug}.estrutura`).toBe(true);
      for (const section of estrutura) {
        expect(typeof section.titulo, `${slug}.estrutura[].titulo`).toBe("string");
        expect(typeof section.oQueVai, `${slug}.estrutura[].oQueVai`).toBe("string");
        expect((section.oQueVai as string).trim().length).toBeGreaterThan(0);
      }
    });

    it("traz um exemplo preenchido, marcado como fictício", () => {
      const exemplo = modelAt(locale, slug)!.exemplo as Json;
      expect(exemplo, `${slug}.exemplo ausente`).toBeDefined();
      expect(typeof exemplo.legenda, `${slug}.exemplo.legenda`).toBe("string");

      const blocos = exemplo.blocos as Json[];
      expect(Array.isArray(blocos) && blocos.length >= 2, `${slug}.exemplo.blocos`).toBe(true);
      for (const bloco of blocos) {
        expect(typeof bloco.titulo, `${slug}.exemplo.blocos[].titulo`).toBe("string");
        expect(isNonEmptyStringList(bloco.corpo), `${slug}.exemplo.blocos[].corpo`).toBe(true);
      }

      // O aviso de "exemplo fictício" é da UI e vale para todos os modelos:
      // conteúdo com cara de relatório real não pode passar por dado de cliente.
      const warning = (MODELS[locale].ui as Json).exampleWarning as string;
      expect(typeof warning).toBe("string");
      expect(warning.trim().length).toBeGreaterThan(0);
    });

    it("tem esqueleto copiável, com campos a preencher e coerente com a anatomia", () => {
      const model = modelAt(locale, slug)!;
      const esqueleto = model.esqueleto as string;
      const estrutura = model.estrutura as Json[];

      expect(esqueleto.includes("\n"), `${slug}: esqueleto de uma linha só`).toBe(true);
      expect(
        (esqueleto.match(/\[[^\]]+\]/g) ?? []).length,
        `${slug}: esqueleto sem campos entre colchetes para preencher`
      ).toBeGreaterThanOrEqual(5);

      // Casa pela palavra mais LONGA do título, não pela primeira: seções como
      // "O que aconteceu, em uma frase" começam por artigo e a primeira palavra
      // não distingue nada.
      const normalize = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const flat = normalize(esqueleto);
      const covered = estrutura.filter((s) => {
        const longest = normalize(s.titulo as string)
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 4)
          .sort((a, b) => b.length - a.length)[0];
        // Sem palavra distintiva, a seção não conta contra o esqueleto.
        return longest ? flat.includes(longest) : true;
      });
      expect(
        covered.length / estrutura.length,
        `${slug}: esqueleto cobre ${covered.length} de ${estrutura.length} seções da anatomia`
      ).toBeGreaterThanOrEqual(0.6);
    });
  });
});

describe("paridade profunda pt-BR ↔ es-ES (modelos de relatório)", () => {
  it("tem a mesma estrutura, inclusive dentro dos arrays", () => {
    const errors: string[] = [];

    function walk(a: unknown, b: unknown, path: string) {
      if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b))
          return errors.push(`tipos diferentes @ ${path}`);
        if (a.length !== b.length) {
          return errors.push(`tamanhos ${a.length} vs ${b.length} @ ${path}`);
        }
        a.forEach((v, i) => walk(v, b[i], `${path}[${i}]`));
        return;
      }
      if (a && typeof a === "object") {
        if (!b || typeof b !== "object") return errors.push(`tipos diferentes @ ${path}`);
        const ka = Object.keys(a as Json);
        const kb = Object.keys(b as Json);
        ka.filter((k) => !kb.includes(k)).forEach((k) =>
          errors.push(`falta em es-ES: ${path}.${k}`)
        );
        kb.filter((k) => !ka.includes(k)).forEach((k) =>
          errors.push(`falta em pt-BR: ${path}.${k}`)
        );
        ka.filter((k) => kb.includes(k)).forEach((k) =>
          walk((a as Json)[k], (b as Json)[k], `${path}.${k}`)
        );
        return;
      }
      if (typeof a !== typeof b) errors.push(`tipos diferentes @ ${path}`);
    }

    walk(MODELS["pt-BR"], MODELS["es-ES"], "");
    expect(errors).toEqual([]);
  });

  it("não deixa ortografia portuguesa vazar para o es-ES, nem dentro de listas", () => {
    const PT_ONLY = /[ãõçâêô]|ções?|ção/;
    const leaks: string[] = [];

    function scan(value: unknown, path: string) {
      if (typeof value === "string") {
        if (PT_ONLY.test(value)) leaks.push(`${path} = "${value.slice(0, 120)}"`);
        return;
      }
      if (Array.isArray(value)) return value.forEach((v, i) => scan(v, `${path}[${i}]`));
      if (value && typeof value === "object") {
        return Object.entries(value as Json).forEach(([k, v]) => scan(v, `${path}.${k}`));
      }
    }

    scan(MODELS["es-ES"], "");
    expect(leaks).toEqual([]);
  });
});
