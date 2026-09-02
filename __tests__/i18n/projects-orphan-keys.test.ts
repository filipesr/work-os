import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guarda de chave ÓRFÃ no dicionário `projects` — a que a paridade de locales não pega.
 *
 * A paridade responde "as duas línguas dizem as mesmas chaves?"; nenhuma responde "alguém ainda
 * lê esta chave?". Foi por aí que o dicionário de `projects` continuou carregando o vocabulário
 * do kanban — filtros, prioridades, "não atribuído" — meses depois de a tela do kanban ter sido
 * substituída pela linha do tempo: texto morto que ainda pedia tradução, revisão e atenção de
 * quem lesse o arquivo procurando o rótulo de verdade.
 *
 * O escopo é só este namespace, e de propósito: os CONSUMIDORES são descobertos pelo mesmo grep
 * que um humano faria (`Translations("projects…")`), então a rede continua valendo se a tela
 * mudar de lugar — e não vira uma varredura global que precisaria adivinhar chave montada em
 * tempo de execução no app inteiro.
 */

const RAIZ = process.cwd();
const FONTES = ["app", "components", "lib"];

function arquivosDeCodigo(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) out.push(...arquivosDeCodigo(rel));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

function achata(obj: Record<string, unknown>, prefixo = "", out: string[] = []): string[] {
  for (const [k, v] of Object.entries(obj)) {
    const chave = prefixo ? `${prefixo}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v))
      achata(v as Record<string, unknown>, chave, out);
    else out.push(chave);
  }
  return out;
}

describe("dicionário projects", () => {
  it("não guarda chave que ninguém mais lê", () => {
    const chaves = achata(
      JSON.parse(readFileSync(join(RAIZ, "locales/pt-BR/projects.json"), "utf8"))
    );

    // Quem abre o namespace, e em que altura dele. `useTranslations("projects.timeline")` significa
    // que os literais daquele arquivo valem a partir de `projects.timeline.`.
    const consumidores: { prefixo: string; literais: Set<string> }[] = [];
    for (const dir of FONTES) {
      for (const arq of arquivosDeCodigo(dir)) {
        const src = readFileSync(join(RAIZ, arq), "utf8");
        const aberturas = [...src.matchAll(/Translations\("(projects(?:\.[\w.]+)?)"\)/g)];
        if (aberturas.length === 0) continue;
        const literais = new Set([...src.matchAll(/"([\w.]+)"/g)].map((m) => m[1]));
        for (const a of aberturas) consumidores.push({ prefixo: a[1], literais });
      }
    }
    expect(
      consumidores.length,
      "ninguém abre o namespace projects — o grep quebrou"
    ).toBeGreaterThan(0);

    const orfas = chaves.filter(
      (chave) =>
        !consumidores.some(({ prefixo, literais }) => {
          const dentro = `projects.${chave}`;
          if (!dentro.startsWith(`${prefixo}.`)) return false;
          return literais.has(dentro.slice(prefixo.length + 1));
        })
    );

    expect(orfas, "chaves de projects.json sem nenhum consumidor").toEqual([]);
  });
});
