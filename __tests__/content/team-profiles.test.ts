import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TEAM_PROFILES,
  TEAM_PROFILE_FAMILIES,
  UNDOCUMENTED_TEAM_NAMES,
} from "@/lib/team-profiles/catalog";

/**
 * Guard de CONTEÚDO dos descritivos de equipe.
 *
 * Por que ele existe além do guard de paridade: `locale-parity` achata objetos
 * mas trata array como folha — e `teamProfiles.json` é quase todo array. Na
 * prática, nem a estrutura interna das listas nem o vazamento de português no
 * es-ES estavam cobertos. Este arquivo fecha os dois buracos, e mais três
 * invariantes que só existem aqui:
 *
 *  - toda equipe conhecida (seed ∪ roster) está coberta ou declarada como não
 *    documentada — nenhuma função da empresa fica invisível;
 *  - `destino: cliente` ⟺ `sensibilidade: CLIENTE`, porque CLIENTE é o único
 *    nível compartilhável para fora (`lib/nas/sensitivity.ts`);
 *  - a seção `avaliacao` não descreve como medida o que os princípios P1/P2
 *    proíbem, e sempre declara o que nunca se faz.
 *
 * O contrato é restado aqui de propósito, em vez de importado de
 * `lib/team-profiles/content.ts`: um guard que reafirma a regra pega o caso em
 * que a regra foi afrouxada no próprio módulo.
 */

const ROOT = process.cwd();
const LOCALES = ["pt-BR", "es-ES"] as const;

type Json = Record<string, unknown>;

function loadProfiles(locale: string): Json {
  return JSON.parse(
    readFileSync(join(ROOT, "locales", locale, "teamProfiles.json"), "utf8")
  ) as Json;
}

const MESSAGES = Object.fromEntries(LOCALES.map((l) => [l, loadProfiles(l)])) as Record<
  string,
  Json
>;

const STRING_LIST_SECTIONS = ["entregaveis"] as const;

const GROUPED_LIST_SECTIONS: Record<string, readonly string[]> = {
  interfaces: ["recebeDe", "entregaPara"],
  obrigacoes: ["diarias", "semanais", "mensais", "anuais"],
  competencias: ["tecnicas", "comportamentais"],
  contratacao: ["requisitos", "diferenciais", "perguntas"],
  avaliacao: ["oQueOlhamos", "comoLemos", "oQueNuncaFazemos"],
};

const TOOL_GROUPS = ["obrigatorias", "apoio", "internas"] as const;
const DESTINATIONS = ["cliente", "gestao", "documentacao"] as const;
const SENSITIVITIES = ["CLIENTE", "INTERNO", "CONFIDENCIAL"] as const;

function profileAt(locale: string, slug: string): Json | undefined {
  const profiles = MESSAGES[locale].profiles as Json | undefined;
  return profiles?.[slug] as Json | undefined;
}

function isNonEmptyStringList(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === "string" && v.trim().length > 0)
  );
}

// ---------------------------------------------------------------------------

describe("catálogo de descritivos de equipe", () => {
  it("cobre toda equipe conhecida (prisma/seed.ts ∪ scripts/import-roster.mjs)", () => {
    const seedSource = readFileSync(join(ROOT, "prisma", "seed.ts"), "utf8");
    const seedBlock = seedSource.match(/const teams = \[([\s\S]*?)\];/);
    expect(seedBlock, "não achei o array `teams` em prisma/seed.ts").not.toBeNull();
    const seedTeams = (seedBlock![1].match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1));

    const rosterSource = readFileSync(join(ROOT, "scripts", "import-roster.mjs"), "utf8");
    const rosterBlock = rosterSource.match(/const CARGO_TEAM = \{([\s\S]*?)\};/);
    expect(rosterBlock, "não achei CARGO_TEAM em scripts/import-roster.mjs").not.toBeNull();
    const rosterTeams = (rosterBlock![1].match(/:\s*"([^"]+)"/g) ?? []).map((s) =>
      s.replace(/^:\s*"/, "").slice(0, -1)
    );

    const known = [...new Set([...seedTeams, ...rosterTeams])].sort();
    const covered = TEAM_PROFILES.flatMap((p) => p.teamNames);
    const declared = new Set([...covered, ...UNDOCUMENTED_TEAM_NAMES]);

    expect(
      known.filter((name) => !declared.has(name)),
      "equipes conhecidas ausentes do catálogo: documente-as ou some-as a UNDOCUMENTED_TEAM_NAMES"
    ).toEqual([]);
    expect(
      [...declared].filter((name) => !known.includes(name)).sort(),
      "nomes no catálogo que não correspondem a nenhuma equipe conhecida"
    ).toEqual([]);
  });

  it("não repete um nome de equipe entre perfis nem entre documentado e não documentado", () => {
    const covered = TEAM_PROFILES.flatMap((p) => p.teamNames);
    const duplicates = covered.filter((name, i) => covered.indexOf(name) !== i);
    expect(duplicates, "nome de equipe em mais de um descritivo").toEqual([]);

    const overlap = covered.filter((name) => UNDOCUMENTED_TEAM_NAMES.includes(name));
    expect(overlap, "equipe documentada e listada como não documentada ao mesmo tempo").toEqual([]);
  });

  it("usa slugs únicos e famílias válidas", () => {
    const slugs = TEAM_PROFILES.map((p) => p.slug);
    expect(slugs.filter((s, i) => slugs.indexOf(s) !== i)).toEqual([]);
    expect(
      slugs.every((s) => /^[a-z0-9-]+$/.test(s)),
      `slug fora do padrão: ${slugs}`
    ).toBe(true);

    const invalid = TEAM_PROFILES.filter(
      (p) => !(TEAM_PROFILE_FAMILIES as readonly string[]).includes(p.family)
    );
    expect(invalid.map((p) => p.slug)).toEqual([]);
  });
});

describe.each(LOCALES)("teamProfiles.json [%s]", (locale) => {
  it("tem um bloco de família para cada família do catálogo", () => {
    const families = (MESSAGES[locale].index as Json).families as Json;
    const missing = TEAM_PROFILE_FAMILIES.filter((f) => !families?.[f]);
    expect(missing, `famílias sem texto em ${locale}`).toEqual([]);
  });

  it("não tem perfil órfão (conteúdo escrito sem entrada no catálogo)", () => {
    const slugs = TEAM_PROFILES.map((p) => p.slug);
    const orphans = Object.keys(MESSAGES[locale].profiles as Json).filter(
      (s) => !slugs.includes(s)
    );
    expect(orphans, `perfis em ${locale} sem entrada em TEAM_PROFILES`).toEqual([]);
  });

  describe.each(TEAM_PROFILES.map((p) => p.slug))("perfil %s", (slug) => {
    it("tem as dez seções preenchidas", () => {
      const profile = profileAt(locale, slug);
      expect(profile, `perfil ${slug} ausente em ${locale}`).toBeDefined();

      for (const key of ["title", "summary", "occupationRef", "missao"] as const) {
        expect(typeof profile![key], `${slug}.${key}`).toBe("string");
        expect((profile![key] as string).trim().length, `${slug}.${key} vazio`).toBeGreaterThan(0);
      }

      for (const section of STRING_LIST_SECTIONS) {
        expect(isNonEmptyStringList(profile![section]), `${slug}.${section}`).toBe(true);
      }

      for (const [section, subKeys] of Object.entries(GROUPED_LIST_SECTIONS)) {
        const block = profile![section] as Json | undefined;
        expect(block, `${slug}.${section} ausente`).toBeDefined();
        for (const key of subKeys) {
          expect(isNonEmptyStringList(block![key]), `${slug}.${section}.${key}`).toBe(true);
        }
      }
    });

    it("descreve ferramentas com nome, propósito e URL absoluta quando houver", () => {
      const tools = profileAt(locale, slug)!.ferramentas as Json;
      expect(tools, `${slug}.ferramentas ausente`).toBeDefined();

      for (const group of TOOL_GROUPS) {
        const entries = tools[group];
        expect(Array.isArray(entries), `${slug}.ferramentas.${group} não é lista`).toBe(true);
        expect((entries as unknown[]).length, `${slug}.ferramentas.${group} vazio`).toBeGreaterThan(
          0
        );

        for (const entry of entries as Json[]) {
          expect(typeof entry.nome, `${slug}.ferramentas.${group}[].nome`).toBe("string");
          expect(typeof entry.para, `${slug}.ferramentas.${group}[].para`).toBe("string");
          if (entry.url !== undefined) {
            expect(
              () => new URL(entry.url as string),
              `URL inválida em ${slug}.ferramentas.${group}: ${String(entry.url)}`
            ).not.toThrow();
            expect(
              (entry.url as string).startsWith("https://"),
              `${slug}: ferramenta externa precisa de https — ${String(entry.url)}`
            ).toBe(true);
          }
        }
        // Referência interna é pasta, manual ou modelo: não tem endereço público.
        if (group === "internas") {
          const withUrl = (entries as Json[]).filter((e) => e.url !== undefined);
          expect(
            withUrl.map((e) => e.nome),
            `${slug}: referência interna com URL`
          ).toEqual([]);
        }
      }
    });

    // Fonte sem endereço conferível é afirmação sem lastro. Nem toda fonte tem
    // URL (um template do fluxo não tem), mas a que tem precisa resolver: URL
    // externa em https, e rota interna que exista de verdade no app router.
    it("cita fontes verificáveis", () => {
      const sources = profileAt(locale, slug)!.fontes as Json[];
      expect(Array.isArray(sources) && sources.length > 0, `${slug}.fontes vazio`).toBe(true);

      for (const source of sources) {
        expect(typeof source.texto, `${slug}.fontes[].texto`).toBe("string");
        expect((source.texto as string).trim().length).toBeGreaterThan(0);
        if (source.url === undefined) continue;

        const url = source.url as string;
        if (url.startsWith("/")) {
          const segments = url.replace(/^\/|\/$/g, "");
          const page = join(ROOT, "app", "[locale]", "(protected)", segments, "page.tsx");
          expect(existsSync(page), `${slug}: fonte aponta para rota inexistente — ${url}`).toBe(
            true
          );
        } else {
          expect(() => new URL(url), `${slug}: URL inválida — ${url}`).not.toThrow();
          expect(url.startsWith("https://"), `${slug}: fonte externa sem https — ${url}`).toBe(
            true
          );
        }
      }

      // Toda referência ocupacional citada no texto precisa levar a algum lugar:
      // é o que o RH usa para conferir o enquadramento.
      const occupational = sources.filter((s) => /O\*NET|\bCBO\b/.test(s.texto as string));
      expect(
        occupational.filter((s) => s.url === undefined).map((s) => s.texto),
        `${slug}: referência ocupacional sem link`
      ).toEqual([]);
    });

    it("declara relatórios com destino e sensibilidade coerentes", () => {
      const reports = profileAt(locale, slug)!.relatorios as Json[];
      expect(Array.isArray(reports) && reports.length > 0, `${slug}.relatorios vazio`).toBe(true);

      for (const report of reports) {
        for (const key of ["nome", "conteudo", "quando", "ondeEntregar"] as const) {
          expect(typeof report[key], `${slug}.relatorios[].${key}`).toBe("string");
          expect((report[key] as string).trim().length).toBeGreaterThan(0);
        }
        expect(DESTINATIONS, `${slug}: destino inválido`).toContain(report.destino);
        expect(SENSITIVITIES, `${slug}: sensibilidade inválida`).toContain(report.sensibilidade);

        // CLIENTE é o único nível compartilhável para fora (lib/nas/sensitivity.ts).
        // Artefato que vai ao cliente não pode nascer INTERNO/CONFIDENCIAL, e o
        // que é interno não pode nascer CLIENTE.
        expect(
          report.destino === "cliente",
          `${slug} / "${String(report.nome)}": destino ${String(report.destino)} com sensibilidade ${String(report.sensibilidade)}`
        ).toBe(report.sensibilidade === "CLIENTE");
      }
    });

    // P1 (informacional, nunca motivacional) e P2 (variação é do sistema).
    // `oQueOlhamos` é a lista do que de fato se mede — ali o vocabulário de
    // premiação/ordenação não pode aparecer. Em `oQueNuncaFazemos` ele PODE e
    // DEVE aparecer: é onde a proibição é escrita.
    it("mantém a seção de avaliação dentro das salvaguardas de P1/P2", () => {
      const evaluation = profileAt(locale, slug)!.avaliacao as Json;
      const forbidden =
        /\brank|ranque|\bnotas?\b|\bscore|puntaje|b[oô]nus\b|\bbono\b|remunera|comiss[aã]o|comisi[oó]n|premia|\bmeta individual|melhor colaborador|mejor colaborador/i;

      const flagged = (evaluation.oQueOlhamos as string[]).filter((item) => forbidden.test(item));
      expect(
        flagged,
        `${slug}.avaliacao.oQueOlhamos descreve como medida algo que P1/P2 proíbem`
      ).toEqual([]);

      expect(
        (evaluation.oQueNuncaFazemos as string[]).length,
        `${slug}: oQueNuncaFazemos precisa de pelo menos dois itens — se você não consegue listá-los, ainda não entendeu o risco desta função`
      ).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("paridade profunda pt-BR ↔ es-ES", () => {
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

    walk(MESSAGES["pt-BR"], MESSAGES["es-ES"], "");
    expect(errors).toEqual([]);
  });

  // O guard oficial só varre folhas string do objeto achatado — e aqui quase
  // tudo é array, então ele não enxerga o conteúdo. Este teste enxerga.
  it("não deixa ortografia portuguesa vazar para o es-ES, nem dentro de listas", () => {
    const PT_ONLY = /[ãõçâêô]|ções?|ção/;
    const leaks: string[] = [];

    function scan(value: unknown, path: string) {
      if (typeof value === "string") {
        if (PT_ONLY.test(value)) leaks.push(`${path} = "${value}"`);
        return;
      }
      if (Array.isArray(value)) return value.forEach((v, i) => scan(v, `${path}[${i}]`));
      if (value && typeof value === "object") {
        return Object.entries(value as Json).forEach(([k, v]) => scan(v, `${path}.${k}`));
      }
    }

    scan(MESSAGES["es-ES"], "");
    expect(leaks).toEqual([]);
  });
});
