import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * O motivo de conclusão é causa declarada, NUNCA ficha da pessoa. Este guarda existe porque a
 * proibição é fácil de esquecer: `groupBy(["userId"])` numa tabela que tem `userId` é a coisa
 * mais natural do mundo de se escrever, e viraria um ranking de quem mais estoura prazo — o
 * oposto do que a feature existe para fazer (P1/P2).
 */
function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return caminho.endsWith(".ts") || caminho.endsWith(".tsx") ? [caminho] : [];
  });
}

describe("StageCompletionNote nunca é agregado por pessoa", () => {
  it("nenhum arquivo agrupa ou conta a nota por usuário", () => {
    const suspeitos: string[] = [];
    for (const caminho of [...arquivos("lib"), ...arquivos("app"), ...arquivos("components")]) {
      const texto = readFileSync(caminho, "utf-8");
      if (!texto.includes("stageCompletionNote")) continue;
      // Recorta o trecho que fala da tabela e procura agregação por pessoa perto dela.
      const trecho = texto.slice(texto.indexOf("stageCompletionNote"));
      const janela = trecho.slice(0, 600);
      if (/groupBy[\s\S]{0,120}userId/.test(janela)) suspeitos.push(caminho);
      if (/_count[\s\S]{0,120}userId/.test(janela)) suspeitos.push(caminho);
    }
    expect(suspeitos).toEqual([]);
  });
});
