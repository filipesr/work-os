import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guard de RESOLUÇÃO de mensagens: toda chave `t("x")` tem que existir no
 * namespace que o arquivo declarou, nos dois locales.
 *
 * Por que não bastava o guard de paridade: ele compara pt-BR com es-ES e passa
 * quando uma chave falta nos DOIS. Foi exatamente o buraco por onde
 * `admin.workflows.stagesCount` escapou numa limpeza de chaves "órfãs" — a
 * paridade seguiu 45/45 e o erro só apareceu como MISSING_MESSAGE em runtime,
 * na tela.
 */

const ROOT = process.cwd();
const LOCALES = ["pt-BR", "es-ES"] as const;

type Json = Record<string, unknown>;

function loadMessages(locale: string): Json {
  const dir = join(ROOT, "locales", locale);
  const out: Json = {};
  for (const file of readdirSync(dir)) {
    if (file.endsWith(".json")) {
      out[file.slice(0, -5)] = JSON.parse(readFileSync(join(dir, file), "utf8"));
    }
  }
  return out;
}

function resolve(messages: Json, path: string): unknown {
  let cur: unknown = messages;
  for (const part of path.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as Json)) {
      cur = (cur as Json)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  for (const base of ["app", "components"]) walk(join(ROOT, base));
  return out;
}

/** `const t = useTranslations("ns")` / `const x = await getTranslations("ns")`. */
const DECL = /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:get|use)Translations\(\s*"([^"]+)"/g;
/** Qualquer `algo("chave")` — cruzado com as declarações acima. */
const CALL = /\b(\w+)\(\s*"([^"]+)"/g;
/**
 * Chave montada em runtime: `` t(`kind.${x}`) ``. O VALOR não é verificável
 * estaticamente, mas o PREFIXO é — e é o prefixo que some numa refatoração.
 * Foi assim que `planning.coverage.kind` inteiro ficou para trás numa divisão
 * de namespace: o guard passava e a tela quebrava em runtime.
 */
const TEMPLATE_CALL = /\b(\w+)\(\s*`([^`$]*)\$\{/g;

describe("resolução de mensagens i18n", () => {
  const messages = Object.fromEntries(LOCALES.map((l) => [l, loadMessages(l)]));

  it('toda chave t("...") resolve no namespace declarado, nos dois locales', () => {
    const missing: string[] = [];

    for (const file of sourceFiles()) {
      const src = readFileSync(file, "utf8");

      const namespaces = new Map<string, string>();
      for (const m of src.matchAll(DECL)) namespaces.set(m[1], m[2]);
      if (namespaces.size === 0) continue;

      for (const m of src.matchAll(CALL)) {
        const ns = namespaces.get(m[1]);
        const key = m[2];
        if (!ns || key.includes("${")) continue;

        for (const locale of LOCALES) {
          if (resolve(messages[locale], `${ns}.${key}`) === undefined) {
            missing.push(`${locale}  ${ns}.${key}  (${relative(ROOT, file)})`);
          }
        }
      }

      // Prefixo das chaves dinâmicas: `t(`kind.${x}`)` exige que `ns.kind`
      // exista e seja um OBJETO (o subtree que contém os valores possíveis).
      for (const m of src.matchAll(TEMPLATE_CALL)) {
        const ns = namespaces.get(m[1]);
        const prefix = m[2].replace(/\.$/, "");
        // `t(`${x}.title`)` não tem prefixo literal — nada a verificar.
        if (!ns || prefix.length === 0) continue;

        for (const locale of LOCALES) {
          const node = resolve(messages[locale], `${ns}.${prefix}`);
          if (node === undefined || typeof node !== "object") {
            missing.push(`${locale}  ${ns}.${prefix}.*  (${relative(ROOT, file)})`);
          }
        }
      }
    }

    expect(missing, `Chaves não resolvidas:\n${missing.join("\n")}`).toEqual([]);
  });
});
