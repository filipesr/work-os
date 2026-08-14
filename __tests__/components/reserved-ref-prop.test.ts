import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * `ref` é prop reservada do React e não atravessa a fronteira de Server
 * Component: "Refs cannot be used in Server Components, nor passed to Client
 * Components". Um componente próprio que declara uma prop chamada `ref` quebra
 * a página em runtime.
 *
 * Este guard é ESTÁTICO de propósito. O teste de render usa Testing Library em
 * jsdom, que é render de cliente — e no React 19 `ref` é prop normal ali. Nenhum
 * teste client-side pega isso; foi assim que `BrazilianRef({ ref })` chegou a
 * /help/equipes/[slug] com a suíte inteira verde.
 *
 * Exceção: `forwardRef`, onde receber `ref` é o contrato.
 */

const ROOT = process.cwd();
const SCANNED_DIRS = ["app", "components"];
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

/** Declarações de componente que desestruturam uma prop chamada exatamente `ref`. */
function findRefProps(source: string): string[] {
  const hits: string[] = [];
  // `function Nome({ ... ref ... })` e `const Nome = ({ ... ref ... }) =>`
  const declaration =
    /(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*(?::[^=]+)?=\s*(?:\([^)]*\)\s*=>\s*)?)\s*\{([^}]*)\}/g;

  for (const match of source.matchAll(declaration)) {
    const name = match[1] ?? match[2];
    const params = match[3];
    if (!name || !params) continue;
    // Desestruturação de prop: `ref` isolado, não `innerRef` nem `refetch`.
    if (/(^|[,{\s])ref\s*(?=[,}:])/.test(params)) hits.push(name);
  }
  return hits;
}

describe("prop reservada `ref`", () => {
  it("nenhum componente próprio declara uma prop chamada `ref` fora de forwardRef", () => {
    const offenders: string[] = [];

    for (const dir of SCANNED_DIRS) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const source = readFileSync(file, "utf8");
        // forwardRef recebe `ref` por contrato — não é o caso que quebra o RSC.
        if (source.includes("forwardRef")) continue;

        for (const component of findRefProps(source)) {
          offenders.push(`${relative(ROOT, file)} → ${component}`);
        }
      }
    }

    expect(
      offenders,
      "renomeie a prop: `ref` não atravessa a fronteira de Server Component"
    ).toEqual([]);
  });
});
