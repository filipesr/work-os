import { describe, it, expect } from "vitest";

import {
  effectiveTeamMode,
  parseTeamParam,
  resolveTeamIds,
  TEAM_PARAM_ALL,
} from "@/lib/planning/team-filter";

const TIMES = [
  { id: "t-video", name: "Video" },
  { id: "t-hr", name: "HR" },
  { id: "t-coord", name: "Coordination" },
  { id: "t-trafego", name: "Traffic" },
];
const OCULTOS = ["HR", "Coordination"];

describe("parseTeamParam", () => {
  it("sem parâmetro é o padrão", () => {
    // A mesa aberta sem filtro nenhum não mostra tudo: mostra o trabalho operacional. Quem quer as
    // equipes de apoio pede por elas.
    expect(parseTeamParam(undefined)).toBe("default");
  });

  it("parâmetro vazio também é o padrão", () => {
    // `?team=` acontece sozinho ao limpar o filtro na barra de endereço, e significa a mesma coisa
    // que não ter parâmetro. Duas grafias para o mesmo estado seriam duas telas diferentes.
    expect(parseTeamParam("")).toBe("default");
    expect(parseTeamParam([])).toBe("default");
  });

  it("`all` mostra tudo, inclusive as ocultas", () => {
    expect(parseTeamParam(TEAM_PARAM_ALL)).toBe("all");
  });

  it("lista separada por vírgula vira seleção específica", () => {
    expect(parseTeamParam("t-video,t-trafego")).toEqual(["t-video", "t-trafego"]);
  });

  it("ignora espaços e pedaços vazios da lista", () => {
    // A URL é editável à mão e sobrevive a copiar/colar. "a,,b" e "a, b" são a mesma intenção.
    expect(parseTeamParam("t-video, ,t-trafego,")).toEqual(["t-video", "t-trafego"]);
  });

  it("lista que sobrou vazia volta a ser o padrão", () => {
    // `?team=,` não é "nenhuma equipe": é ruído. Mostrar uma grade vazia por causa disso seria
    // esconder a semana inteira sem que ninguém tenha pedido.
    expect(parseTeamParam(",")).toBe("default");
  });

  it("repetição do parâmetro na URL também é lida", () => {
    // Next entrega `?team=a&team=b` como array; a tela só escreve a forma com vírgula, mas ler as
    // duas evita uma URL compartilhada que abre diferente de onde foi copiada.
    expect(parseTeamParam(["t-video", "t-trafego"])).toEqual(["t-video", "t-trafego"]);
  });
});

describe("resolveTeamIds", () => {
  it("o padrão é todo mundo menos as equipes ocultas", () => {
    expect(resolveTeamIds("default", TIMES, OCULTOS)).toEqual(["t-video", "t-trafego"]);
  });

  it("`all` não filtra nada — devolve indefinido", () => {
    // Indefinido é o que as consultas já entendem como "sem recorte". Devolver a lista completa
    // funcionaria, mas trocaria um `where` ausente por um `IN` com todos os ids, à toa.
    expect(resolveTeamIds("all", TIMES, OCULTOS)).toBeUndefined();
  });

  it("seleção específica vale mesmo quando inclui uma equipe oculta", () => {
    // Ocultar é um PADRÃO, não uma proibição: quem marcou HR de propósito quer ver HR.
    expect(resolveTeamIds(["t-hr"], TIMES, OCULTOS)).toEqual(["t-hr"]);
  });

  it("descarta id que não existe mais", () => {
    // Link antigo, ou equipe apagada depois que alguém salvou a URL. Filtrar por um id morto
    // devolveria uma grade vazia sem explicar por quê.
    expect(resolveTeamIds(["t-video", "t-apagada"], TIMES, OCULTOS)).toEqual(["t-video"]);
  });

  it("se a seleção inteira morreu, cai no padrão", () => {
    expect(resolveTeamIds(["t-apagada"], TIMES, OCULTOS)).toEqual(["t-video", "t-trafego"]);
  });

  it("nome de equipe oculta que não existe no banco não atrapalha", () => {
    // A lista de ocultas é por NOME, e nome muda no cadastro sem avisar ninguém. O pior caso é
    // uma equipe voltar a aparecer — nunca uma tela quebrada.
    // Nenhuma equipe do banco casa com o nome configurado, então NADA é escondido — e "nada
    // escondido" é `undefined` (sem recorte), a mesma representação do caso sem lista nenhuma.
    expect(resolveTeamIds("default", TIMES, ["Fantasma"])).toBeUndefined();
  });

  it("sem equipes ocultas configuradas, o padrão é não filtrar", () => {
    expect(resolveTeamIds("default", TIMES, [])).toBeUndefined();
  });
});

describe("effectiveTeamMode", () => {
  it("devolve o modo pedido quando ele se sustenta", () => {
    expect(effectiveTeamMode("default", TIMES)).toBe("default");
    expect(effectiveTeamMode("all", TIMES)).toBe("all");
    expect(effectiveTeamMode(["t-video"], TIMES)).toEqual(["t-video"]);
  });

  it("some com o id que não existe mais, em vez de propagá-lo para a tela", () => {
    // O controle marca o que está APLICADO. Um id morto marcado seria uma caixa que não
    // corresponde a nada na grade.
    expect(effectiveTeamMode(["t-video", "t-apagada"], TIMES)).toEqual(["t-video"]);
  });

  it("seleção inteiramente morta vira o padrão — e o controle precisa saber disso", () => {
    // Se a tela continuasse achando que há seleção explícita, mostraria caixas marcadas enquanto a
    // grade exibe o padrão. É a contradição que este modo efetivo existe para evitar.
    expect(effectiveTeamMode(["t-apagada"], TIMES)).toBe("default");
  });
});
