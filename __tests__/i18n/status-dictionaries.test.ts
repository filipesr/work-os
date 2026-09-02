import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda de dicionário de STATUS incompleto — o que a paridade de locales não pega.
 *
 * A paridade compara os idiomas ENTRE SI: se os dois esquecerem a mesma chave, ela passa feliz. Foi
 * exatamente o que aconteceu com `OBSOLETE`, acrescentado ao enum depois — `reportsCalendar` ficou
 * com cinco dos seis status nos dois idiomas, e a tela quebrou em produção com `MISSING_MESSAGE` ao
 * encontrar a primeira demanda obsoleta do mês.
 *
 * O contraste que explica por que só o lado do i18n quebrou: no MESMO componente, o mapa de classes
 * CSS é `Record<DemandTask["status"], string>` — o TypeScript recusa compilar se faltar um status.
 * O JSON não tem quem o obrigue, e este teste é quem passa a obrigar.
 *
 * A varredura é por FORMA, não por lista de arquivos: qualquer dicionário cujas chaves sejam status
 * de demanda entra automaticamente, então um mapa novo em outro namespace nasce coberto.
 */

const LOCALES_DIR = join(process.cwd(), "locales");

/** Fonte da verdade: o enum do Prisma, lido do schema em vez de repetido aqui — uma cópia é o que
 *  diverge no dia em que alguém acrescentar o sétimo status. */
function statusDoEnum(): string[] {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
  const bloco = /enum TaskStatus \{([^}]*)\}/.exec(schema);
  if (!bloco) throw new Error("enum TaskStatus não encontrado no schema");
  return bloco[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);
}

type Json = Record<string, unknown>;

/** Todo dicionário de status do arquivo, com o caminho até ele. Reconhece pela FORMA: só chaves do
 *  enum, e pelo menos duas delas — um objeto com uma chave só seria coincidência, não dicionário. */
function dicionariosDeStatus(
  obj: Json,
  enumStatus: Set<string>,
  prefixo = "",
  achados: { path: string; keys: string[] }[] = []
) {
  const chaves = Object.keys(obj);
  const parecemStatus = chaves.length >= 2 && chaves.every((k) => enumStatus.has(k));
  if (parecemStatus) achados.push({ path: prefixo, keys: chaves });
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      dicionariosDeStatus(v as Json, enumStatus, prefixo ? `${prefixo}.${k}` : k, achados);
    }
  }
  return achados;
}

describe("dicionários de status", () => {
  const enumStatus = statusDoEnum();

  it("o enum foi lido do schema, e não de uma cópia", () => {
    // Se a leitura falhar em silêncio, o teste abaixo passaria comparando com uma lista vazia.
    expect(enumStatus).toContain("OBSOLETE");
    expect(enumStatus.length).toBeGreaterThanOrEqual(6);
  });

  for (const locale of ["pt-BR", "es-ES"]) {
    it(`[${locale}] todo dicionário de status cobre o enum inteiro`, () => {
      const conjunto = new Set(enumStatus);
      const faltando: string[] = [];

      for (const arquivo of readdirSync(join(LOCALES_DIR, locale)).filter((f) =>
        f.endsWith(".json")
      )) {
        const json = JSON.parse(readFileSync(join(LOCALES_DIR, locale, arquivo), "utf8")) as Json;
        for (const dic of dicionariosDeStatus(json, conjunto)) {
          const ausentes = enumStatus.filter((s) => !dic.keys.includes(s));
          if (ausentes.length > 0) {
            faltando.push(`${arquivo}:${dic.path} → sem ${ausentes.join(", ")}`);
          }
        }
      }

      expect(faltando, "dicionários de status incompletos").toEqual([]);
    });
  }
});
