import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assinarNavegacao,
  navegacaoIniciou,
  navegacaoTerminou,
  navegacoesEmVoo,
  resetarNavegacao,
} from "@/lib/navigation-busy";

beforeEach(() => resetarNavegacao());

describe("contador de navegações em voo", () => {
  it("começa em zero", () => {
    expect(navegacoesEmVoo()).toBe(0);
  });

  it("conta início e fim", () => {
    navegacaoIniciou();
    expect(navegacoesEmVoo()).toBe(1);
    navegacaoTerminou();
    expect(navegacoesEmVoo()).toBe(0);
  });

  it("duas navegações sobrepostas: a primeira a terminar NÃO apaga a barra", () => {
    // Trocar o filtro enquanto a semana anterior ainda carrega. Com booleano no lugar do contador,
    // o fim da primeira apagaria a barra com a segunda ainda em voo — e a tela voltaria a parecer
    // parada justamente quando ainda está trabalhando.
    navegacaoIniciou();
    navegacaoIniciou();
    navegacaoTerminou();
    expect(navegacoesEmVoo()).toBe(1);
    navegacaoTerminou();
    expect(navegacoesEmVoo()).toBe(0);
  });

  it("um `fim` a mais não deixa o contador negativo", () => {
    // Efeito que roda duas vezes em modo estrito, desmontagem no meio da navegação: com contador
    // negativo, a barra ficaria acesa para sempre na navegação seguinte.
    navegacaoTerminou();
    navegacaoTerminou();
    expect(navegacoesEmVoo()).toBe(0);
    navegacaoIniciou();
    expect(navegacoesEmVoo()).toBe(1);
  });

  it("avisa quem estiver ouvindo, e para de avisar quem cancelou", () => {
    const ouvinte = vi.fn();
    const cancelar = assinarNavegacao(ouvinte);
    navegacaoIniciou();
    expect(ouvinte).toHaveBeenCalledTimes(1);
    navegacaoTerminou();
    expect(ouvinte).toHaveBeenCalledTimes(2);

    cancelar();
    navegacaoIniciou();
    expect(ouvinte).toHaveBeenCalledTimes(2);
  });
});
