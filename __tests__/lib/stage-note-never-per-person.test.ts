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

/** Todo índice onde `alvo` aparece em `texto` — não só o primeiro. Um arquivo grande pode ter mais
 *  de uma função que fala de `stageCompletionNote`, e a segunda não pode ficar fora do guarda. */
function ocorrencias(texto: string, alvo: string): number[] {
  const posicoes: number[] = [];
  for (let i = texto.indexOf(alvo); i !== -1; i = texto.indexOf(alvo, i + alvo.length)) {
    posicoes.push(i);
  }
  return posicoes;
}

describe("StageCompletionNote nunca é agregado por pessoa", () => {
  it("nenhum arquivo agrupa ou conta a nota por usuário", () => {
    const suspeitos: string[] = [];
    for (const caminho of [...arquivos("lib"), ...arquivos("app"), ...arquivos("components")]) {
      const texto = readFileSync(caminho, "utf-8");
      // Cada ocorrência ganha a própria janela: um arquivo com 2000+ linhas pode ter mais de uma
      // função que fala da tabela, e olhar só a partir da primeira deixaria as demais no escuro.
      for (const pos of ocorrencias(texto, "stageCompletionNote")) {
        const janela = texto.slice(pos, pos + 600);
        if (/groupBy[\s\S]{0,120}userId/.test(janela) || /_count[\s\S]{0,120}userId/.test(janela)) {
          suspeitos.push(caminho);
          break;
        }
      }
    }
    expect(suspeitos).toEqual([]);
  });
});
